// Removes pasted code, JSON, logs and stack traces from message text before it goes to the model,
// keeping the prose around them. Deterministic and line-based: each line is classified as code or
// prose, and only substantial runs of code lines are replaced by a short placeholder such as
// "[stack trace, 23 lines: java.util.concurrent.TimeoutException]". Long URLs are shortened.
// The full text stays in the database; references are extracted from it, not from this.

export type Compacted = { text: string; snippets: number; removedChars: number };

const MIN_CODE_LINES = 3; // a run needs this many code lines…
const MIN_RUN_CHARS = 120; // …and this much text to be removed
const BLOB_CHARS = 200; // a single code line this long is removed on its own (minified JSON, escaped logs)
const MAX_GAP = 2; // non-code lines a run may bridge (e.g. "Expression:" between two blocks)
const LONG_URL = 100;

type Kind = "code" | "prose" | "blank" | "other";

// Shapes only code has. A line matching one is code even if it contains words.
const STRONG: RegExp[] = [
  /^\s*[{}[\]()]+[,;)]*\s*$/, // lone brackets
  /^\s*[{[]?\s*\\?"[^"\\]{1,80}\\?"\s*:/, // JSON key: "key": … (also escaped \"key\":)
  /^\s*[{[]\s*\\?["{[]/, // starts a JSON object/array
  /^\s*[\w.-]+\s*\{\s*$/, // proto/text format block: headers {
  /^\s*[\w.-]+:\s*("|-?\d+(\.\d+)?\s*$|true\b|false\b|null\b|[A-Z][A-Z0-9_]{2,}\s*$)/, // proto/yaml field: key: "v" / 12 / ENUM
  /^\s*at\s+[\w$.<>/-]+\(.*\)\s*$/, // stack frame
  /^\s*\.{3}\s*\d+\s+more\s*$/, // "... 12 more"
  /^\s*\d{1,2}:\d{2}:\d{2}[.,]\d+/, // log timestamp
  /^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/, // ISO timestamp log line
  /^\s*(SELECT|FROM|WHERE|INNER JOIN|LEFT JOIN|RIGHT JOIN|JOIN|ON|AND|OR|GROUP BY|ORDER BY|HAVING|LIMIT|UNION|INSERT INTO|UPDATE|DELETE FROM|VALUES)\b/,
  /^\s*,\s*[\w.`]+/, // SQL leading-comma column
  /^\s*(\/\/|--|#!)/, // line comment
  /^\s*-{1,2}[A-Za-z][\w-]*\s+['"]/, // CLI flag with quoted value: -H 'accept: …'
  /^\s*(curl|wget|gcloud|kubectl|docker)\s+\S/, // shell commands
  /^\s*<\/?[A-Za-z][\w:-]*(\s[^>]*)?\/?>\s*$/, // XML/HTML tag line
  /^\s*[\w$]+(\.[\w$]+)+\(.*\)[;,]?\s*$/, // a whole line that is a method call: logger.info("…")
  /\)\s*\{\s*$/, // block header: if (…) {, for (…) {, foo() {
  /(===|!==|&&)/,
];

// Signs prose can show too (a sentence ending in ";" or starting with "If"), so only used when a line doesn't read as prose.
const WEAK: RegExp[] = [
  /^\s*(export\s+)?(async\s+)?(function|const|let|var|class|interface|type|enum|import|package|def|fun|val|private|public|protected|static|return)\b.*([({;=]|=>)/,
  /^\s*(if|for|while|switch|catch|else)\b.*[({]\s*$/,
  /\s\\\s*$/, // shell line continuation
  /;\s*$/, // statement terminator
  /^\s*[\w$]+\(.*\)[;,]?\s*$/, // a whole line that is a call: foo(…)
  /[{([,]\s*$/, // line opens a block or continues a list
  /^\s*[\w$]+(\[\d+\])?(\.[\w$]+(\[\d+\])?)+\s*([,:=<>-].*)?$/, // dotted path, optionally with a value: loan.x[3].y:- 1.2
  /^\s*\.?\/?[\w.:@-]+(\/[\w.:@-]+){2,}\s*$/, // bare file path
  /(=>|\|\||::|->)/,
  /[A-Za-z0-9+/=_-]{40,}/, // long unbroken token (base64, hashes, JWTs); dotted names don't count
];

const SYMBOLS = /[{}[\]()<>;="`|\\_$]/g;
const WORDS = /\b[A-Za-z][a-z]+\b/g; // ordinary words, not identifiers like fooBar_baz or SCREAMING_CASE

function classify(line: string): Kind {
  const t = line.trim();
  if (!t) return "blank";
  if (STRONG.some((re) => re.test(line))) return "code";
  // Lines with links are kept: PR, Jira and doc links are what updates are made of.
  if (/https?:\/\//.test(t)) return "prose";
  const words = t.match(WORDS) ?? [];
  const wordChars = words.reduce((n, w) => n + w.length, 0);
  // Reads as prose: several ordinary words making up most of the line.
  if (words.length >= 4 && wordChars / t.length >= 0.5) return "prose";
  const symbolRatio = (t.match(SYMBOLS)?.length ?? 0) / t.length;
  if (WEAK.some((re) => re.test(line)) || (t.length > 20 && symbolRatio > 0.12)) return "code";
  // Neither: short labels ("Logs:", "Expression:") or word-ish code. Absorbed only when between code lines.
  return "other";
}

function describe(lines: string[]): string {
  const body = lines.join("\n");
  let kind = "code";
  if (/^\s*at\s+[\w$.<>/-]+\(/m.test(body) || /\b\w+(Exception|Error)\b[:\s]/.test(body) && /\(\w+\.(java|kt|scala):\d+\)/.test(body)) kind = "stack trace";
  else if (/^\s*\d{1,2}:\d{2}:\d{2}[.,]\d+/m.test(body) || /^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/m.test(body)) kind = "log";
  else if (/^\s*[{[]/.test(body) && /\\?"[^"\\]+\\?"\s*:/.test(body)) kind = "JSON";
  else if (/^\s*(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/m.test(body)) kind = "SQL";
  else if (/^\s*curl\b/m.test(body)) kind = "curl command";
  else if (/^\s*[\w.-]+\s*\{\s*$/m.test(body)) kind = "proto";

  const count = `${lines.length} line${lines.length === 1 ? "" : "s"}`;
  // For errors, the error line is what a stand-up might need ("fixed the MalformedURLException").
  const errorLine = lines.map((l) => l.trim()).find((l) => /\b\w*(Exception|Error)\b|\bfailed\b/i.test(l) && l.length >= 10);
  if (errorLine && (kind === "stack trace" || kind === "log" || kind === "code")) {
    const short = errorLine.length > 100 ? `${errorLine.slice(0, 100)}…` : errorLine;
    return `[${kind}, ${count}: ${short}]`;
  }
  return `[${kind}, ${count}]`;
}

/** Shortens long URLs (signed storage links, log queries) to host and the start of the path. */
export function shortenUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s<>"'`]+/g, (url) => {
    if (url.length <= LONG_URL) return url;
    try {
      const u = new URL(url);
      // Keep PR, issue and commit paths up to their id, and Jira's ?selectedIssue=; cut the rest.
      const id = u.pathname.match(/^.*?\/(pull|pulls|issues|browse|commit)\/[\w-]+/)?.[0];
      const issue = u.searchParams.get("selectedIssue");
      const path = id ?? u.pathname.slice(0, 40);
      const kept = `${u.origin}${path}${issue ? `?selectedIssue=${issue}` : ""}`;
      return kept.length < url.length ? `${kept}…` : kept;
    } catch {
      return `${url.slice(0, LONG_URL)}…`;
    }
  });
}

export function compactText(raw: string): Compacted {
  let text = shortenUrls(raw);
  // Logs pasted as one line with escaped newlines ("…\n\tat java.base/…"): split them so the frames can be found.
  if ((text.match(/\\n/g)?.length ?? 0) >= 3) text = text.replace(/\\r?\\n/g, "\n").replace(/\\t/g, "\t");

  const lines = text.split("\n");
  const kinds = lines.map(classify);
  const out: string[] = [];
  let snippets = 0;

  let i = 0;
  while (i < lines.length) {
    if (kinds[i] !== "code") {
      out.push(lines[i]);
      i++;
      continue;
    }
    // Extend the run while code lines keep coming, bridging short gaps of blank/other lines.
    let end = i; // last code line in the run
    let j = i + 1;
    while (j < lines.length) {
      if (kinds[j] === "code") {
        end = j;
        j++;
      } else if (kinds[j] === "prose") break;
      else {
        let k = j;
        while (k < lines.length && (kinds[k] === "blank" || kinds[k] === "other") && k - j < MAX_GAP + 1) k++;
        if (k < lines.length && kinds[k] === "code" && k - j <= MAX_GAP) j = k;
        else break;
      }
    }
    const run = lines.slice(i, end + 1);
    const codeLines = run.filter((_, n) => kinds[i + n] === "code").length;
    const chars = run.reduce((n, l) => n + l.length + 1, 0);
    const isBlob = run.length === 1 && run[0].trim().length >= BLOB_CHARS;
    if ((codeLines >= MIN_CODE_LINES && chars >= MIN_RUN_CHARS) || isBlob) {
      out.push(describe(run));
      snippets++;
    } else {
      out.push(...run);
    }
    i = end + 1;
  }

  const result = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: result, snippets, removedChars: Math.max(0, raw.length - result.length) };
}
