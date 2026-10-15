// Your own code activity for a period, collected mechanically (no AI): commits from local git (every
// branch, pushed or not) and PRs and reviews from GitHub via the gh CLI. Merged per repo, deduplicated
// across clones, and rendered compactly for the stand-up input.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CONFIG_PATH, git, loadConfig, resolveRepos, type CodeConfig } from "./config";

const run = promisify(execFile);

/** Branches that collect everyone's work; commits are attributed to feature branches over these. */
const LONG_LIVED = /^(main|master|develop|dev|staging|qa|pre-qa|prod|pre-prod|production|release(\/.*)?|hotfix)$/;

export type CodeCommit = { sha: string; subject: string; at: number };
export type CodeItem =
  | {
      kind: "pr";
      repo: string;
      number: number;
      title: string;
      url: string;
      state: "open" | "merged" | "closed";
      draft: boolean;
      head: string;
      base: string;
      createdMs: number;
      mergedMs: number | null;
      closedMs: number | null;
      commits: CodeCommit[];
      why: string | null;
    }
  | { kind: "branch"; repo: string; branch: string | null; commits: CodeCommit[]; url: string | null }
  | { kind: "promotion"; repo: string; moves: { from: string; to: string; number: number; url: string; at: number }[] }
  | { kind: "closed"; repo: string; prs: { number: number; title: string; url: string; at: number }[] }
  | { kind: "review"; repo: string; number: number; title: string; url: string; author: string; verdict: string; at: number };

export type CodeActivity = { items: CodeItem[]; errors: string[]; commits: number; logins: Record<string, string> };

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The useful sentences of a PR description: template headings, placeholders and checklists removed. */
export function prWhy(body: string | null | undefined): string | null {
  if (!body) return null;
  const lines = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^[-*]\s*\[[ xX]\]/.test(l) && !/^\[?[A-Z]+-0+\]?$/.test(l) && !/^\[[A-Z][A-Z0-9]+-\d+\]\(.*\)$/.test(l));
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 220 ? `${text.slice(0, 219)}…` : text;
}

async function gh(host: string, args: string[]): Promise<unknown> {
  const { stdout } = await run("gh", args, { env: { ...process.env, GH_HOST: host }, maxBuffer: 32 * 1024 * 1024, timeout: 30_000 });
  return JSON.parse(stdout);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

type LocalCommit = CodeCommit & { repo: string; branch: string | null; host: string | null };

/** Your commits authored in [fromMs, toMs) across the repos, deduplicated across clones, with a best-guess branch. */
function localCommits(code: CodeConfig, fromMs: number, toMs: number, errors: string[]): LocalCommit[] {
  const bySha = new Map<string, LocalCommit>();
  const since = `@${Math.floor(fromMs / 1000)}`;
  for (const entry of resolveRepos(code)) {
    if (entry.status === "missing") errors.push(`${entry.entry}: path doesn't exist`);
    if (entry.status === "not_repo") errors.push(`${entry.entry}: not a git repo, and no git repos directly inside it`);
    for (const repo of entry.repos) {
      const emails = new Set(code.emails.length ? code.emails : repo.email ? [repo.email] : []);
      if (!emails.size) {
        errors.push(`${repo.path}: no email to match commits (set "emails" or git user.email)`);
        continue;
      }
      try {
        // Committer date >= author date, so this finds every commit authored since the start, rebased or not.
        // Branches, remote branches and tags (not --all, which includes stashes).
        const out = git(repo.path, ["log", "--branches", "--remotes", "--tags", "--no-merges", `--since=${since}`, "--format=%H%x1f%at%x1f%ae%x1f%s"]);
        const mine = out
          .split("\n")
          .filter(Boolean)
          .map((l) => l.split("\x1f"))
          .filter(([, at, ae, subject]) => emails.has(ae.toLowerCase()) && Number(at) * 1000 >= fromMs && Number(at) * 1000 < toMs && !/^(WIP on|index on|On) [^:]+: /.test(subject));
        if (!mine.length) continue;

        // Which local branch each commit is on: feature branches over long-lived ones.
        const branchOf = new Map<string, string>();
        const heads = git(repo.path, ["for-each-ref", "refs/heads", "--format=%(refname:short)%x1f%(committerdate:unix)"])
          .split("\n")
          .filter(Boolean)
          .map((l) => l.split("\x1f"))
          .filter(([, t]) => Number(t) * 1000 >= fromMs)
          .map(([b]) => b)
          .sort((a, b) => Number(LONG_LIVED.test(a)) - Number(LONG_LIVED.test(b)));
        for (const b of heads) {
          for (const sha of git(repo.path, ["log", b, "--no-merges", `--since=${since}`, "--format=%H"]).split("\n").filter(Boolean)) {
            if (!branchOf.has(sha)) branchOf.set(sha, b);
          }
        }
        for (const [sha, at, , subject] of mine) {
          if (bySha.has(sha)) continue;
          bySha.set(sha, { sha, subject, at: Number(at) * 1000, repo: repo.name, host: repo.host, branch: branchOf.get(sha) ?? null });
        }
      } catch (err) {
        errors.push(`${repo.path}: git failed (${(err as Error).message.split("\n")[0]})`);
      }
    }
  }
  return [...bySha.values()].sort((a, b) => a.at - b.at);
}

type SearchPr = { number: number; title: string; url: string; state: string; repository: { nameWithOwner: string }; author?: { login: string } };
type PrView = {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  body: string;
  commits: { oid: string; messageHeadline: string; authoredDate: string; authors: { email: string; login: string }[] }[];
  reviews: { author: { login: string } | null; state: string; submittedAt: string }[];
};
const PR_FIELDS = "number,title,url,state,isDraft,headRefName,baseRefName,createdAt,mergedAt,closedAt,body,commits,reviews";

const loginCache = new Map<string, string>();

export async function collectCodeActivity(fromMs: number, toMs: number): Promise<CodeActivity | null> {
  const { code, error } = loadConfig();
  if (error) return { items: [], errors: [error], commits: 0, logins: {} };
  if (!code || !code.repos.length) return null;

  const errors: string[] = [];
  const local = localCommits(code, fromMs, toMs, errors);
  const items: CodeItem[] = [];
  const logins: Record<string, string> = {};
  const inWindow = (t: number | null) => t !== null && t >= fromMs && t < toMs;
  const claimed = new Set<string>();
  // Rebased copies of a PR's commits (e.g. in another clone) have other ids but the same message.
  const claimedSubjects = new Set<string>();
  const norm = (s: string) => s.replace(/…$/, "").trim().toLowerCase().slice(0, 60);

  const hosts = code.github ? [...new Set(resolveRepos(code).flatMap((e) => e.repos.map((r) => r.host)).filter((h): h is string => !!h))] : [];
  for (const host of hosts) {
    let login: string;
    try {
      login = loginCache.get(host) ?? String(await gh(host, ["api", "user", "--jq", "{login: .login}"]).then((u) => (u as { login: string }).login));
      loginCache.set(host, login);
      logins[host] = login;
    } catch {
      errors.push(`GitHub (${host}): gh isn't signed in; run: gh auth login --hostname ${host}`);
      continue;
    }
    // Searches are by day (UTC), so ask a day wider and filter by exact times below. Events are searched
    // directly (opened / merged / closed in the period): a PR's "updated" date moves with any later activity.
    const range = `${ymd(fromMs - 864e5)}..${ymd(toMs + 864e5)}`;
    const since = `>=${ymd(fromMs - 864e5)}`;
    try {
      const search = async (args: string[]) => (await gh(host, ["search", "prs", ...args, "--limit", "100", "--json", "number,title,url,state,repository,author"])) as SearchPr[];
      // "closed:" search misses some PRs on GitHub's side, so closed PRs are also found by their last update
      // (a closed PR rarely changes after closing). Exact times are checked below either way.
      const [opened, merged, closed, closedUpdated, reviewedAll] = await Promise.all([
        search(["--author=@me", `--created=${range}`]),
        search(["--author=@me", `--merged-at=${range}`]),
        search(["--author=@me", `--closed=${range}`]),
        search(["--author=@me", "--state=closed", `--updated=${range}`]),
        search(["--reviewed-by=@me", `--updated=${since}`]),
      ]);
      const key = (repo: string, n: number) => `${repo}#${n}`;
      const authored = new Map<string, SearchPr>();
      for (const p of [...opened, ...merged, ...closed, ...closedUpdated]) authored.set(key(p.repository.nameWithOwner, p.number), p);
      const reviewed = reviewedAll.filter((p) => p.author?.login !== login && !authored.has(key(p.repository.nameWithOwner, p.number)));

      const view = async (repo: string, n: number) => {
        try {
          return (await gh(host, ["pr", "view", String(n), "-R", repo, "--json", PR_FIELDS])) as PrView;
        } catch {
          errors.push(`GitHub: couldn't read ${repo}#${n}`);
          return null;
        }
      };
      const promotions = new Map<string, { from: string; to: string; number: number; url: string; at: number }[]>();
      const closedOnly = new Map<string, { number: number; title: string; url: string; at: number }[]>();
      const seen = new Set<string>();

      const addPr = (repo: string, v: PrView) => {
        if (seen.has(key(repo, v.number))) return;
        seen.add(key(repo, v.number));
        const created = ms(v.createdAt)!;
        const mergedAt = ms(v.mergedAt);
        const closedAt = ms(v.closedAt);
        if (LONG_LIVED.test(v.headRefName) && LONG_LIVED.test(v.baseRefName)) {
          // Promoting one shared branch into another (pre-qa → qa): one fact, not a PR's worth of commits.
          if (inWindow(created) || inWindow(mergedAt)) {
            promotions.set(repo, [...(promotions.get(repo) ?? []), { from: v.headRefName, to: v.baseRefName, number: v.number, url: v.url, at: mergedAt ?? created }]);
          }
          return;
        }
        const commits = v.commits
          .filter((c) => c.authors.some((a) => a.login === login || code.emails.includes(a.email?.toLowerCase())) && inWindow(ms(c.authoredDate)))
          .map((c) => ({ sha: c.oid, subject: c.messageHeadline, at: ms(c.authoredDate)! }));
        if (!inWindow(created) && !inWindow(mergedAt) && !inWindow(closedAt) && !commits.length) return;
        for (const c of v.commits) {
          claimed.add(c.oid);
          claimedSubjects.add(`${repo}|${norm(c.messageHeadline)}`);
        }
        if (v.state === "CLOSED" && !inWindow(created) && !commits.length) {
          // Old PRs closed without merging (e.g. a cleanup): grouped, they're one fact.
          closedOnly.set(repo, [...(closedOnly.get(repo) ?? []), { number: v.number, title: v.title, url: v.url, at: closedAt! }]);
          return;
        }
        items.push({
          kind: "pr",
          repo,
          number: v.number,
          title: v.title,
          url: v.url,
          state: v.state === "MERGED" ? "merged" : v.state === "CLOSED" ? "closed" : "open",
          draft: v.isDraft,
          head: v.headRefName,
          base: v.baseRefName,
          createdMs: created,
          mergedMs: mergedAt,
          closedMs: v.state === "CLOSED" ? closedAt : null,
          commits,
          // The description only matters when the PR was opened or merged in the period.
          why: inWindow(created) || inWindow(mergedAt) ? prWhy(v.body) : null,
        });
      };

      const authoredViews = await mapLimit([...authored.values()], 8, async (p) => ({ repo: p.repository.nameWithOwner, v: await view(p.repository.nameWithOwner, p.number) }));
      for (const { repo, v } of authoredViews) if (v) addPr(repo, v);

      // Your commits in the period that belong to a PR found no other way (opened before, merged after).
      // GitHub knows which PRs contain a pushed commit; unpushed ones stay as branch work.
      const unclaimed = new Map<string, LocalCommit>();
      for (const c of local) if (c.host === host && !claimed.has(c.sha) && !claimedSubjects.has(`${c.repo}|${norm(c.subject)}`)) unclaimed.set(`${c.repo}|${norm(c.subject)}`, c);
      const owners = await mapLimit([...unclaimed.values()].slice(0, 20), 8, async (c) => {
        try {
          return { c, prs: (await gh(host, ["api", `repos/${c.repo}/commits/${c.sha}/pulls`, "--jq", "[.[] | {number: .number}]"])) as { number: number }[] };
        } catch {
          return { c, prs: [] };
        }
      });
      const extra = new Set<string>();
      for (const { c, prs } of owners) for (const p of prs) if (!seen.has(key(c.repo, p.number))) extra.add(key(c.repo, p.number));
      const extraViews = await mapLimit([...extra], 8, async (k) => {
        const [repo, n] = k.split("#");
        return { repo, v: await view(repo, Number(n)) };
      });
      for (const { repo, v } of extraViews) if (v) addPr(repo, v);

      // Reviews you gave in the period (not on your own PRs): your strongest verdict.
      const reviewViews = await mapLimit(reviewed, 8, async (p) => ({ p, v: await view(p.repository.nameWithOwner, p.number) }));
      for (const { p, v } of reviewViews) {
        if (!v) continue;
        const mine = v.reviews.filter((x) => x.author?.login === login && inWindow(ms(x.submittedAt)));
        if (!mine.length) continue;
        const rank = { APPROVED: 3, CHANGES_REQUESTED: 2, COMMENTED: 1 } as Record<string, number>;
        const best = [...mine].sort((a, b) => (rank[b.state] ?? 0) - (rank[a.state] ?? 0))[0];
        items.push({ kind: "review", repo: p.repository.nameWithOwner, number: v.number, title: v.title, url: v.url, author: p.author?.login ?? "someone", verdict: best.state.toLowerCase().replace("_", " "), at: ms(best.submittedAt)! });
      }

      for (const [repo, moves] of promotions) items.push({ kind: "promotion", repo, moves: moves.sort((a, b) => a.at - b.at) });
      for (const [repo, prs] of closedOnly) items.push({ kind: "closed", repo, prs: prs.sort((a, b) => a.at - b.at) });
    } catch (err) {
      errors.push(`GitHub (${host}): ${(err as Error).message.split("\n")[0]}`);
    }
  }

  // Local commits not in any of those PRs, by repo and branch.
  const branches = new Map<string, Extract<CodeItem, { kind: "branch" }>>();
  for (const c of local) {
    if (claimed.has(c.sha) || claimedSubjects.has(`${c.repo}|${norm(c.subject)}`)) continue;
    const key = `${c.repo}|${c.branch ?? ""}`;
    const url = c.host && c.branch && !LONG_LIVED.test(c.branch) ? `https://${c.host}/${c.repo}/tree/${c.branch}` : null;
    const item = branches.get(key) ?? { kind: "branch" as const, repo: c.repo, branch: c.branch, commits: [], url };
    // Amended or rebased copies of one commit share its message: keep the latest.
    const same = item.commits.findIndex((x) => norm(x.subject) === norm(c.subject));
    if (same >= 0) item.commits.splice(same, 1);
    item.commits.push({ sha: c.sha, subject: c.subject, at: c.at });
    branches.set(key, item);
  }
  items.push(...branches.values());

  const commits = new Set([...local.map((c) => c.sha), ...items.flatMap((i) => (i.kind === "pr" ? i.commits.map((c) => c.sha) : []))]).size;
  return { items, errors, commits, logins };
}

// ---------- rendering for the model ----------

const shortRepo = (repo: string) => repo.split("/").pop()!;

/** A compact, numbered section ("g1", "g2"…). Commit lists are capped so a busy period can't flood the input. */
export function renderCodeActivity(a: CodeActivity, fromMs: number, toMs: number): { text: string; refs: Record<string, CodeItem> } {
  const days = Math.round((toMs - fromMs) / 864e5);
  const multiDay = days > 1;
  const date = (t: number) => new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = (t: number) => new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  // A single day: "today 13:21" for that day, dates for anything before it. A range: dates.
  const when = (t: number) => (multiDay || t < fromMs ? date(t) : `today ${time(t)}`);
  const inPeriod = (t: number | null): t is number => t !== null && t < toMs;
  const perItem = days > 7 ? 3 : multiDay ? 5 : 8;
  const subject = (s: string) => (s.length > 100 ? `${s.slice(0, 99)}…` : s);
  const commitList = (cs: CodeCommit[]) => {
    const shown = cs.slice(0, perItem).map((c) => `${subject(c.subject)} (${when(c.at)})`);
    return shown.join("; ") + (cs.length > perItem ? `; +${cs.length - perItem} more` : "");
  };

  // PRs first (merged, then opened), then branches by size, then promotions and reviews. At most 40 items.
  const order = (i: CodeItem) => ({ pr: 0, branch: 1, promotion: 2, review: 3, closed: 4 })[i.kind];
  const sorted = [...a.items].sort((x, y) => order(x) - order(y) || (y.kind === "branch" && x.kind === "branch" ? y.commits.length - x.commits.length : 0));
  const MAX = 40;
  const refs: Record<string, CodeItem> = {};
  const lines = sorted.slice(0, MAX).map((item, n) => {
    const ref = `g${n + 1}`;
    refs[ref] = item;
    const r = shortRepo(item.repo);
    switch (item.kind) {
      case "pr": {
        // As things stood at the end of the period: later merges or closes aren't part of it.
        const merged = inPeriod(item.mergedMs);
        const closed = inPeriod(item.closedMs);
        const events = [
          `opened ${when(item.createdMs)}`,
          merged && `merged ${when(item.mergedMs!)}`,
          closed && `closed without merging ${when(item.closedMs!)}`,
          !merged && !closed && (item.draft ? "still a draft at the end of the period" : "still open at the end of the period"),
        ].filter(Boolean);
        const commits = item.commits.length ? ` Your commits: ${commitList(item.commits)}.` : "";
        const why = item.why ? ` Description: ${item.why}` : "";
        return `[${ref}] ${r} · PR #${item.number} "${item.title}" (${item.head} → ${item.base}): ${events.join(", ")}.${commits}${why}`;
      }
      case "branch":
        return `[${ref}] ${r} · ${item.branch ? `branch ${item.branch}` : "commits"}${item.branch && !LONG_LIVED.test(item.branch) ? ", not in a PR" : ""}: ${item.commits.length} commit${item.commits.length === 1 ? "" : "s"}: ${commitList(item.commits)}.`;
      case "promotion": {
        const byRoute = new Map<string, typeof item.moves>();
        for (const m of item.moves) byRoute.set(`${m.from} → ${m.to}`, [...(byRoute.get(`${m.from} → ${m.to}`) ?? []), m]);
        const parts = [...byRoute].map(([route, ms]) => `${route} ${ms.length}× (${ms.map((m) => `#${m.number} ${when(m.at)}`).join(", ")})`);
        return `[${ref}] ${r} · moved shared branches: ${parts.join("; ")}.`;
      }
      case "review":
        return `[${ref}] ${r} · reviewed PR #${item.number} by ${item.author} "${item.title}": ${item.verdict} (${when(item.at)}).`;
      case "closed": {
        const title = (t: string) => (t.length > 50 ? `${t.slice(0, 49)}…` : t);
        return `[${ref}] ${r} · closed ${item.prs.length} old PR${item.prs.length === 1 ? "" : "s"} without merging: ${item.prs.map((p) => `#${p.number} "${title(p.title)}" (${when(p.at)})`).join(", ")}.`;
      }
    }
  });
  const dropped = sorted.length - lines.length;
  return { text: lines.join("\n") + (dropped > 0 ? `\n(+${dropped} smaller items left out)` : ""), refs };
}

/** How a code item shows up as a reference chip on an update. */
export function codeItemLink(item: CodeItem): { kind: "pr" | "link"; label: string; url?: string }[] {
  const r = shortRepo(item.repo);
  switch (item.kind) {
    case "pr":
    case "review":
      return [{ kind: "pr", label: `${r}#${item.number}`, url: item.url }];
    case "promotion":
      return [];
    case "branch":
      return item.branch ? [{ kind: "link", label: `${r}: ${item.branch}`, url: item.url ?? undefined }] : [];
    case "closed":
      return item.prs.map((p) => ({ kind: "pr" as const, label: `${r}#${p.number}`, url: p.url }));
  }
}

/** One line describing a code item, for the update's sources, as things stood at the end of the period. */
export function codeItemSummary(item: CodeItem, toMs: number): string {
  const r = shortRepo(item.repo);
  switch (item.kind) {
    case "pr": {
      const state = item.mergedMs !== null && item.mergedMs < toMs ? "merged" : item.closedMs !== null && item.closedMs < toMs ? "closed" : "open";
      return `${r} PR #${item.number} "${item.title}" · ${state}${item.commits.length ? ` · ${item.commits.length} of your commits` : ""}`;
    }
    case "branch":
      return `${r} ${item.branch ? `branch ${item.branch}` : "commits"} · ${item.commits.length} commit${item.commits.length === 1 ? "" : "s"}: ${item.commits
        .slice(0, 3)
        .map((c) => c.subject)
        .join("; ")}${item.commits.length > 3 ? "; …" : ""}`;
    case "promotion":
      return `${r} moved ${item.moves.map((m) => `${m.from} → ${m.to} (#${m.number})`).join(", ")}`;
    case "review":
      return `${r} reviewed PR #${item.number} by ${item.author} "${item.title}" · ${item.verdict}`;
    case "closed":
      return `${r} closed ${item.prs.map((p) => `#${p.number}`).join(", ")} without merging`;
  }
}

// ---------- setup status (Data page) ----------

export type CodeSetup = {
  configPath: string;
  configured: boolean;
  error: string | null;
  entries: { entry: string; status: "ok" | "missing" | "not_repo"; repos: { path: string; name: string; lastCommitMs: number | null; email: string | null }[] }[];
  github: { host: string; login: string | null; error: string | null }[] | null;
};

const statusCache = new Map<string, { at: number; login: string | null; error: string | null }>();

/** What's configured and whether it works: repos found, your last commit in each, gh sign-in per host. */
export async function codeSetupStatus(): Promise<CodeSetup> {
  const { code, error, exists } = loadConfig();
  if (!code) return { configPath: CONFIG_PATH, configured: false, error: exists ? error : null, entries: [], github: null };
  const entries = resolveRepos(code).map((e) => ({
    entry: e.entry,
    status: e.status,
    repos: e.repos.map((r) => {
      const emails = code.emails.length ? code.emails : r.email ? [r.email] : [];
      let lastCommitMs: number | null = null;
      try {
        const out = emails.length ? git(r.path, ["log", "--branches", "--remotes", "-1", "--format=%at", ...emails.map((m) => `--author=${m}`)]).trim() : "";
        lastCommitMs = out ? Number(out) * 1000 : null;
      } catch {
        // unreadable repo
      }
      return { path: r.path, name: r.name, lastCommitMs, email: emails[0] ?? null };
    }),
  }));
  if (!code.github) return { configPath: CONFIG_PATH, configured: true, error, entries, github: null };

  const hosts = [...new Set(resolveRepos(code).flatMap((e) => e.repos.map((r) => r.host)).filter((h): h is string => !!h))];
  const github = await Promise.all(
    hosts.map(async (host) => {
      const cached = statusCache.get(host);
      if (cached && Date.now() - cached.at < 10 * 60_000) return { host, login: cached.login, error: cached.error };
      let result: { login: string | null; error: string | null };
      try {
        result = { login: ((await gh(host, ["api", "user", "--jq", "{login: .login}"])) as { login: string }).login, error: null };
      } catch (err) {
        const msg = (err as NodeJS.ErrnoException).code === "ENOENT" ? "the gh CLI isn't installed" : `not signed in; run: gh auth login --hostname ${host}`;
        result = { login: null, error: msg };
      }
      statusCache.set(host, { at: Date.now(), ...result });
      return { host, ...result };
    }),
  );
  return { configPath: CONFIG_PATH, configured: true, error, entries, github };
}

/** Cheap check for the stand-up page: is code activity set up, and from how many repos. */
export function codeRepoCount(): number | null {
  const { code } = loadConfig();
  if (!code || !code.repos.length) return null;
  return resolveRepos(code, { light: true }).reduce((n, e) => n + e.repos.length, 0);
}
