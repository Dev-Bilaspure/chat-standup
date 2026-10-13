// Diagnostic: what was captured in the last N minutes, and a deep search for a term.
// Usage: npx tsx spike/recent.ts [minutes=15] [term=heron]
// Prints endpoints/kinds and at most 40 chars around each match; no other message content.
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../data/capture");
const minutes = Number(process.argv[2] ?? 15);
const term = (process.argv[3] ?? "heron").toLowerCase();
type Capture = { seq: number; t: number; frame: string; kind: string; endpoint: string; body: string | null };

const all: Capture[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)))
  .sort((a, b) => a.t - b.t);
const lastT = all.at(-1)?.t ?? 0;
const recent = all.filter((r) => r.t >= Date.now() - minutes * 60_000);
const time = (t: number) => new Date(t).toLocaleTimeString();

console.log(`Latest capture: ${time(lastT)} (${Math.round((Date.now() - lastT) / 1000)}s ago). ${recent.length} captures in the last ${minutes} min.\n`);

console.log("Page loads:");
for (const r of all.filter((r) => r.kind === "frame-loaded")) console.log(`  ${time(r.t)}  ${r.endpoint}`);

console.log(`\nEndpoints in the last ${minutes} min (kind, count, first→last):`);
const eps = new Map<string, { n: number; first: number; last: number; bytes: number }>();
for (const r of recent) {
  const k = `${r.kind.padEnd(8)} ${r.endpoint.replace("https://", "")}`;
  const e = eps.get(k) ?? { n: 0, first: r.t, last: r.t, bytes: 0 };
  e.n++;
  e.last = r.t;
  e.bytes += r.body?.length ?? 0;
  eps.set(k, e);
}
for (const [k, e] of [...eps].sort((a, b) => a[1].first - b[1].first)) {
  if (/play\.google\.com\/log|cleardot/.test(k)) continue;
  console.log(`  ${String(e.n).padStart(4)}× ${String(Math.round(e.bytes / 1024)).padStart(5)}KB  ${time(e.first)}→${time(e.last)}  ${k}`);
}

// Deep search: plain, JSON-unescaped, and every base64-looking token at all 4 alignments.
const around = (s: string, i: number) => JSON.stringify(s.slice(Math.max(0, i - 15), i + term.length + 15));
console.log(`\nDeep search for "${term}" across ALL captures:`);
let hits = 0;
for (const r of all) {
  if (!r.body) continue;
  const where = `${time(r.t)} ${r.kind} ${r.endpoint.replace("https://", "")}`;
  const variants: [string, string][] = [
    ["plain", r.body],
    ["unescaped", r.body.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/")],
  ];
  for (const [how, text] of variants) {
    const i = text.toLowerCase().indexOf(term);
    if (i >= 0) {
      hits++;
      console.log(`  ✔ ${how.padEnd(9)} ${where}  ${around(text, i)}`);
      break;
    }
  }
  const body = r.body.replace(/\\u003d/g, "=").replace(/\\\//g, "/");
  for (const m of body.matchAll(/[A-Za-z0-9+/_-]{12,}={0,2}/g)) {
    for (let off = 0; off < 4; off++) {
      const decoded = Buffer.from(m[0].slice(off), "base64").toString("latin1");
      const i = decoded.toLowerCase().indexOf(term);
      if (i >= 0) {
        hits++;
        console.log(`  ✔ base64+${off}  ${where}  ${around(decoded, i)}`);
        break;
      }
    }
  }
}
if (!hits) console.log("  ✘ no match anywhere");
