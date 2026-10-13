// Diagnostic: where (and in what encoding) did given phrases arrive in captured traffic?
// Usage: npx tsx spike/find.ts "phrase one" "phrase two"
// Prints only endpoints and match types, never message content. The structure dump at the end
// replaces every word/token with its length, so it shows framing without showing text.
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../data/capture");
const phrases = process.argv.slice(2).map((p) => p.toLowerCase());
type Capture = { seq: number; t: number; frame: string; kind: string; endpoint: string; body: string | null };

const records: Capture[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));

// Re-join streamed chunks per (frame, kind, endpoint) so phrases split across chunks are found.
const streams = new Map<string, Capture[]>();
for (const r of records) {
  const key = `${r.kind} ${r.endpoint}`;
  streams.set(key, [...(streams.get(key) ?? []), r]);
}

const nonText = new Map<string, number>();
for (const r of records) if (r.body === null) nonText.set(`${r.kind} ${r.endpoint}`, (nonText.get(`${r.kind} ${r.endpoint}`) ?? 0) + 1);

const B64 = /[A-Za-z0-9+/_-]{16,}={0,2}/g;
const unescape = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\n/g, "\n");

console.log(`${records.length} captures, ${streams.size} endpoints\n`);
for (const phrase of phrases) {
  console.log(`=== "${phrase}"`);
  let found = false;
  for (const [key, chunks] of streams) {
    const joined = chunks.sort((a, b) => a.t - b.t || a.seq - b.seq).map((c) => c.body ?? "").join("");
    const lower = joined.toLowerCase();
    const how: string[] = [];
    if (lower.includes(phrase)) {
      how.push(chunks.some((c) => c.body?.toLowerCase().includes(phrase)) ? "plain" : "plain, split across chunks");
    } else if (unescape(joined).toLowerCase().includes(phrase)) {
      how.push("JSON-escaped");
    }
    let b64 = 0;
    for (const m of joined.matchAll(B64)) {
      if (Buffer.from(m[0], "base64").toString("latin1").toLowerCase().includes(phrase)) b64++;
    }
    if (b64) how.push(`base64-encoded (${b64} blobs)`);
    if (how.length) {
      found = true;
      console.log(`  ✔ ${key}  →  ${how.join("; ")}`);
    }
  }
  if (!found) console.log("  ✘ not found in any captured text");
}

if (nonText.size) {
  console.log("\nNon-text responses (body not captured):");
  for (const [k, n] of nonText) if (!k.startsWith("frame-loaded") && !k.startsWith("worker")) console.log(`  ${String(n).padStart(4)}  ${k}`);
}

console.log("\nPush channel structure (tokens replaced by their length):");
for (const [key, chunks] of streams) {
  if (!key.includes("multi-watch/channel")) continue;
  const big = chunks.filter((c) => (c.body?.length ?? 0) > 50).slice(0, 3);
  console.log(`  ${key}: ${chunks.length} chunks, sizes ${chunks.map((c) => c.body?.length ?? 0).slice(0, 15).join(",")}${chunks.length > 15 ? ",…" : ""}`);
  for (const c of big) console.log(`    ${c.body!.slice(0, 400).replace(/[A-Za-z0-9+/=_-]{3,}/g, (m) => `‹${m.length}›`).replace(/\n/g, "⏎")}`);
}
