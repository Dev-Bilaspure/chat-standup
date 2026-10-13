// Diagnostic: show where a term (a name, user ID, or conversation ID) appears in plain-text
// captures, with surrounding context, to learn how IDs map to names.
// Usage: npx tsx spike/context.ts "Some Name" 1234567890 [--width 150] [--max 3]
// Note: prints raw surrounding text, which may include other names or message snippets.
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../data/capture");
const args = process.argv.slice(2);
const opt = (f: string, d: number) => (args.includes(f) ? Number(args[args.indexOf(f) + 1]) : d);
const width = opt("--width", 150);
const maxPerEndpoint = opt("--max", 3);
const terms = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

const records = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));

for (const term of terms) {
  console.log(`\n=== ${term}`);
  const perEndpoint = new Map<string, number>();
  for (const r of records) {
    if (!r.body) continue;
    let i = r.body.indexOf(term);
    while (i >= 0) {
      const n = perEndpoint.get(r.endpoint) ?? 0;
      perEndpoint.set(r.endpoint, n + 1);
      if (n < maxPerEndpoint) {
        const snippet = r.body.slice(Math.max(0, i - width), i + term.length + width).replace(/\s+/g, " ");
        console.log(`\n  [${r.kind} ${r.endpoint}]\n  …${snippet}…`);
      }
      i = r.body.indexOf(term, i + term.length);
    }
  }
  if (!perEndpoint.size) console.log("  not found in plain text (may only exist base64-encoded)");
  else console.log(`\n  totals: ${[...perEndpoint].map(([e, n]) => `${n}× ${e.split("/").slice(-1)[0]}`).join(", ")}`);
}
