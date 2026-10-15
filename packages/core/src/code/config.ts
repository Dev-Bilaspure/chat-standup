// Personal settings in chat-notes.config.json at the repo root (gitignored; see chat-notes.config.example.json).
// Read fresh on every use, so edits apply without a restart.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "../paths";

export const CONFIG_PATH = process.env.CHAT_NOTES_CONFIG ?? path.join(REPO_ROOT, "chat-notes.config.json");

export type CodeConfig = {
  /** Git repos, or folders whose direct children are git repos. Absolute paths; "~" works. */
  repos: string[];
  /** Your commit emails. Empty: each repo's own git user.email. */
  emails: string[];
  /** Also read PRs and reviews from GitHub through the gh CLI. */
  github: boolean;
};

export type ConfigResult = { exists: boolean; code: CodeConfig | null; error: string | null };

/** Allows // and /* *\/ comments and trailing commas, so the file can be annotated. */
function parseLooseJson(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function loadConfig(): ConfigResult {
  if (!fs.existsSync(CONFIG_PATH)) return { exists: false, code: null, error: null };
  try {
    const raw = parseLooseJson(fs.readFileSync(CONFIG_PATH, "utf8")) as { code?: Partial<CodeConfig> };
    const c = raw.code;
    if (!c) return { exists: true, code: null, error: null };
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : []);
    return { exists: true, code: { repos: strings(c.repos), emails: strings(c.emails).map((e) => e.toLowerCase()), github: c.github !== false }, error: null };
  } catch (err) {
    return { exists: true, code: null, error: `chat-notes.config.json couldn't be read: ${(err as Error).message}` };
  }
}

const expand = (p: string) => (p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p);
const isRepo = (dir: string) => fs.existsSync(path.join(dir, ".git"));

export function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

export type RepoEntry = {
  /** As written in the config. */
  entry: string;
  status: "ok" | "missing" | "not_repo";
  repos: { path: string; remote: string | null; host: string | null; name: string; email: string | null }[];
};

/** owner/name and host from a remote URL (https or ssh). */
export function parseRemote(url: string): { host: string; name: string } | null {
  const m = url.trim().match(/^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?([^/:]+)[/:](.+?)(?:\.git)?\/?$/);
  return m ? { host: m[1], name: m[2] } : null;
}

/**
 * Resolves the configured paths to git repos; a folder that isn't a repo stands for the repos directly inside it.
 * light: only look at the filesystem (no git calls), for counting on page loads.
 */
export function resolveRepos(code: CodeConfig, opts: { light?: boolean } = {}): RepoEntry[] {
  const seen = new Set<string>();
  return code.repos.map((entry) => {
    const dir = path.resolve(expand(entry));
    if (!fs.existsSync(dir)) return { entry, status: "missing", repos: [] };
    const candidates = isRepo(dir)
      ? [dir]
      : fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && isRepo(path.join(dir, d.name)))
          .map((d) => path.join(dir, d.name));
    if (!candidates.length) return { entry, status: "not_repo", repos: [] };
    const repos = candidates
      .map((p) => fs.realpathSync(p))
      .filter((p) => !seen.has(p) && seen.add(p))
      .map((p) => {
        if (opts.light) return { path: p, remote: null, host: null, name: path.basename(p), email: null };
        let remote: string | null = null;
        let email: string | null = null;
        try {
          remote = git(p, ["remote", "get-url", "origin"]).trim() || null;
        } catch {
          // no origin
        }
        try {
          email = git(p, ["config", "user.email"]).trim().toLowerCase() || null;
        } catch {
          // not set
        }
        const parsed = remote ? parseRemote(remote) : null;
        return { path: p, remote, host: parsed?.host ?? null, name: parsed?.name ?? path.basename(p), email };
      });
    return { entry, status: "ok", repos };
  });
}
