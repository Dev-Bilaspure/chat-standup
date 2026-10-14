// Pulls references (PRs, Jira issues, docs, other links) out of the messages a bullet cites.
// Done in code rather than by the model, so a reference can never be invented.

export type Reference = { kind: "pr" | "jira" | "doc" | "link"; label: string; url?: string };

const URL_RE = /https?:\/\/[^\s<>()"'`]+/g;
// Jira-style keys like PROJ-123. Requires 2+ letters so things like "v2-1" don't match.
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g;
const NOT_JIRA = new Set(["UTF", "ISO", "SHA", "COVID", "GPT", "HTTP", "TLS", "SSL", "MP"]);
const IGNORED_HOSTS = /(^|\.)(chat\.google\.com|meet\.google\.com|lh3\.googleusercontent\.com)$/;

function fromUrl(raw: string): Reference | null {
  const url = raw.replace(/[.,;:!?)\]]+$/, "");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (IGNORED_HOSTS.test(u.hostname)) return null;

  // GitHub / GitHub Enterprise pull requests: /org/repo/pull/123[/files|/changes…]
  const pr = u.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (pr) return { kind: "pr", label: `${pr[2]}#${pr[3]}`, url: `${u.origin}/${pr[1]}/${pr[2]}/pull/${pr[3]}` };

  // Jira issues: /browse/KEY-123 or ?selectedIssue=KEY-123
  const jira = u.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/) ?? u.search.match(/selectedIssue=([A-Z][A-Z0-9]+-\d+)/);
  if (jira) return { kind: "jira", label: jira[1], url: `${u.origin}/browse/${jira[1]}` };

  // Google Docs / Sheets / Slides
  const doc = u.hostname === "docs.google.com" && u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
  if (doc) {
    const kind = { document: "Doc", spreadsheets: "Sheet", presentation: "Slides" }[doc[1] as "document" | "spreadsheets" | "presentation"];
    return { kind: "doc", label: `Google ${kind}`, url: `${u.origin}/${doc[1]}/d/${doc[2]}` };
  }

  // Code links on GitHub-like hosts: /org/repo/blob|tree/branch/path, /org/repo/commit/sha
  const code = u.pathname.match(/^\/[^/]+\/([^/]+)\/(?:blob|tree)\/[^/]+\/(.+)$/);
  if (code) return { kind: "link", label: `${code[1]}: ${code[2].split("/").pop()}`, url };
  const commit = u.pathname.match(/^\/[^/]+\/([^/]+)\/commit\/([0-9a-f]{7,40})/);
  if (commit) return { kind: "link", label: `${commit[1]}@${commit[2].slice(0, 7)}`, url };

  const path = u.pathname.replace(/\/$/, "");
  const short = path.length > 28 ? `${path.slice(0, 27)}…` : path;
  return { kind: "link", label: `${u.hostname.replace(/^www\./, "")}${short}`, url };
}

/** Unique references found in the given texts, PRs and Jira issues first. */
export function extractReferences(texts: string[]): Reference[] {
  const found = new Map<string, Reference>();
  const add = (r: Reference | null) => {
    if (!r) return;
    const key = r.url ?? `${r.kind}:${r.label}`;
    // A Jira key mentioned in text and the same key as a link: keep the link version.
    if (r.kind === "jira") for (const [k, v] of found) if (v.kind === "jira" && v.label === r.label) found.delete(k);
    if (!found.has(key)) found.set(key, r);
  };
  for (const text of texts) {
    for (const m of text.matchAll(URL_RE)) add(fromUrl(m[0]));
    const withoutUrls = text.replace(URL_RE, " ");
    for (const m of withoutUrls.matchAll(JIRA_KEY_RE)) {
      const key = m[1];
      if (NOT_JIRA.has(key.split("-")[0])) continue;
      if ([...found.values()].some((r) => r.kind === "jira" && r.label === key)) continue;
      add({ kind: "jira", label: key });
    }
  }
  const order = { pr: 0, jira: 1, doc: 2, link: 3 };
  return [...found.values()].sort((a, b) => order[a.kind] - order[b.kind]);
}
