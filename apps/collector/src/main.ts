// Always-on local service: receives captures from the Chrome extension, keeps the useful ones
// as raw JSONL (so the database can be rebuilt with `pnpm reparse`), and ingests them.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { COLLECTOR_PORT, Ingestor, RAW_DIR, getDb, isUseful, toDateStr, type CaptureRecord } from "@chat-notes/core";

fs.mkdirSync(RAW_DIR, { recursive: true });
const ingestor = new Ingestor();
const startedAt = Date.now();
let lastRecordAt = 0;
let records = 0;
let messages = 0;

const log = (msg: string) => console.log(`${new Date().toLocaleString("en-IN")}  ${msg}`);

function handle(r: CaptureRecord) {
  records++;
  lastRecordAt = Date.now();
  if (r.kind === "frame-loaded") log(`Chat page loaded: ${r.endpoint}`);
  if (isUseful(r) && r.captured !== false) {
    fs.appendFileSync(path.join(RAW_DIR, `${toDateStr(new Date(r.t))}.jsonl`), JSON.stringify(r) + "\n");
  }
  try {
    messages += ingestor.ingest(r);
  } catch (err) {
    log(`ingest error on ${r.kind} ${r.endpoint}: ${(err as Error).message}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM messages WHERE created_us >= ?").get(today.getTime() * 1000) as { n: number };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, startedAt, lastRecordAt, records, messagesIngested: messages, messagesToday: row.n }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/ingest") {
    res.statusCode = 404;
    res.end();
    return;
  }
  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.statusCode = 204;
    res.end();
    try {
      handle(JSON.parse(raw));
    } catch {
      // Malformed record; nothing to do.
    }
  });
});

server.listen(COLLECTOR_PORT, "127.0.0.1", () => log(`collector listening on http://127.0.0.1:${COLLECTOR_PORT}, raw → ${RAW_DIR}`));
server.on("error", (err) => {
  log(`server error: ${err.message}`);
  process.exit(1);
});

// Hourly heartbeat in the log, so gaps are visible when reading it later.
setInterval(() => {
  const idle = lastRecordAt ? Math.round((Date.now() - lastRecordAt) / 60_000) : -1;
  log(`heartbeat: ${records} records, ${messages} messages since start; last capture ${idle < 0 ? "never" : `${idle} min ago`}`);
}, 60 * 60_000);
