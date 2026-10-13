// Local receiver for the capture extension. Stores everything to data/capture/*.jsonl
// and answers the feasibility question by watching for "canary" words you send in chat.
//
// Usage: pnpm capture --canary zebra42 --canary otter42 ...
// Message text is never printed; only which endpoint carried each canary, and when.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = 4777;
const DATA_DIR = path.resolve(import.meta.dirname, "../data/capture");
fs.mkdirSync(DATA_DIR, { recursive: true });

const canaries = process.argv.flatMap((a, i, all) => (all[i - 1] === "--canary" ? [a.toLowerCase()] : []));
const canaryHits = new Map<string, { endpoint: string; kind: string; frame: string; t: number }[]>();
const endpoints = new Map<string, { kind: string; count: number; bytes: number; captured: boolean }>();
const startedAt = Date.now();
let total = 0;
let lastAt = 0;

// A live Chat tab produces traffic every few seconds (channel keep-alives, logging).
// Long silence means the tab was closed, discarded by Chrome, or lost the extension.
setInterval(() => {
  if (!lastAt) return;
  const silent = Math.round((Date.now() - lastAt) / 1000);
  if (silent >= 60) console.log(`⚠ ${new Date().toLocaleTimeString()} nothing received for ${silent}s — is the Chat tab open, not asleep? Reload it.`);
}, 60_000);

type Capture = { seq: number; t: number; frame: string; kind: string; endpoint: string; body: string | null; captured: boolean };

http
  .createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/ingest") {
      res.statusCode = 404;
      return void res.end();
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.end();
      let msg: Capture;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      handle(msg);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Receiver on http://127.0.0.1:${PORT}. Writing to ${path.relative(process.cwd(), DATA_DIR)}/`);
    console.log(canaries.length ? `Watching for canaries: ${canaries.join(", ")}` : "No --canary words given; only collecting.");
    console.log("Waiting for the extension… (reload your Chat tab after loading it)\n");
  });

function handle(msg: Capture) {
  total++;
  if (lastAt && Date.now() - lastAt >= 60_000) console.log(`✔ ${new Date().toLocaleTimeString()} receiving again`);
  lastAt = Date.now();
  const day = new Date(msg.t).toISOString().slice(0, 10);
  if (msg.captured) fs.appendFileSync(path.join(DATA_DIR, `${day}.jsonl`), JSON.stringify(msg) + "\n");

  const key = `${msg.kind} ${msg.endpoint}`;
  const isNew = !endpoints.has(key);
  const e = endpoints.get(key) ?? { kind: msg.kind, count: 0, bytes: 0, captured: msg.captured };
  e.count++;
  e.bytes += msg.body?.length ?? 0;
  endpoints.set(key, e);

  if (msg.kind === "frame-loaded") console.log(`[frame]  ${new Date().toLocaleTimeString()} ${msg.endpoint}`);
  else if (msg.kind.startsWith("worker-created")) console.log(`[WORKER] ${msg.kind.split(":")[1]} ${msg.endpoint}  ← traffic inside workers is NOT hooked`);
  else if (isNew && msg.captured) console.log(`[new endpoint] ${msg.kind.padEnd(4)} ${msg.endpoint}`);

  if (!msg.body) return;
  const lower = msg.body.toLowerCase();
  for (const c of canaries) {
    if (!lower.includes(c)) continue;
    const hits = canaryHits.get(c) ?? [];
    canaryHits.set(c, hits);
    if (!hits.some((h) => h.endpoint === msg.endpoint && h.kind === msg.kind)) {
      console.log(`\n✔ CANARY "${c}" seen via ${msg.kind} ${msg.endpoint}  (frame ${msg.frame}) at ${new Date(msg.t).toLocaleTimeString()}\n`);
    }
    hits.push({ endpoint: msg.endpoint, kind: msg.kind, frame: msg.frame, t: msg.t });
  }
}

process.on("SIGINT", () => {
  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\n${"─".repeat(70)}\n${total} captures in ${mins} min\n\nCaptured endpoints (by volume):`);
  for (const [key, e] of [...endpoints].filter(([, e]) => e.captured).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 15)) {
    console.log(`  ${String(e.count).padStart(6)} msgs ${(e.bytes / 1024).toFixed(0).padStart(7)} KB  ${key}`);
  }
  if (canaries.length) {
    console.log("\nCanaries:");
    for (const c of canaries) {
      const hits = canaryHits.get(c);
      console.log(`  ${hits ? "✔" : "✘"} ${c}${hits ? `  (${hits.length} hits, first via ${hits[0].kind} ${hits[0].endpoint})` : "  NOT SEEN"}`);
    }
  }
  process.exit(0);
});
