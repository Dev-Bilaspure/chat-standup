// Always-on local service: receives captures from the Chrome extension, ingests them into the database,
// and keeps the useful ones as raw JSONL for re-parsing recent days (`pnpm reparse`). Hourly maintenance
// backs up the database, compresses finished raw days and deletes raw days past the retention window.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { COLLECTOR_PORT, Ingestor, RAW_DIR, getDb, isKeptRaw, runMaintenance, toDateStr, type CaptureRecord } from "@chat-notes/core";

fs.mkdirSync(RAW_DIR, { recursive: true });
const ingestor = new Ingestor();
const startedAt = Date.now();
let lastRecordAt = 0;
let records = 0;
let messages = 0;

const log = (msg: string) => console.log(`${new Date().toLocaleString("en-IN")}  ${msg}`);

// Only the extension may send captures. Requests must be addressed to this Mac by name (stops DNS
// rebinding), and captures from a browser must come from an extension, not a web page (which could
// otherwise inject fake messages). No Origin means a tool on this Mac, like curl. Bodies are capped.
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const MAX_BODY = 32 * 1024 * 1024;

function handle(r: CaptureRecord) {
  records++;
  lastRecordAt = Date.now();
  if (r.kind === "frame-loaded") log(`Chat page loaded: ${r.endpoint}`);
  let onlyBlocked = false;
  try {
    messages += ingestor.ingest(r);
    onlyBlocked = ingestor.lastOnlyBlocked;
  } catch (err) {
    log(`ingest error on ${r.kind} ${r.endpoint}: ${(err as Error).message}`);
  }
  // Kept even when parsing failed (so a parser fix can recover it); not kept when it held only blocked chats.
  if (isKeptRaw(r) && !onlyBlocked) {
    fs.appendFileSync(path.join(RAW_DIR, `${toDateStr(new Date(r.t))}.jsonl`), JSON.stringify(r) + "\n");
  }
}

const server = http.createServer((req, res) => {
  if (!LOCAL_HOST.test(req.headers.host ?? "")) {
    res.statusCode = 403;
    res.end();
    return;
  }
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
  const origin = req.headers.origin;
  if (origin && !origin.startsWith("chrome-extension://")) {
    log(`refused a capture from ${origin}`);
    res.statusCode = 403;
    res.end();
    return;
  }
  let raw = "";
  let tooBig = false;
  req.setEncoding("utf8");
  req.on("data", (c: string) => {
    if (tooBig) return;
    raw += c;
    if (raw.length > MAX_BODY) {
      tooBig = true;
      raw = "";
      res.statusCode = 413;
      res.end();
    }
  });
  req.on("end", () => {
    if (tooBig) return;
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

// Maintenance shortly after start, then hourly; each step only does work once a day.
setTimeout(() => void runMaintenance(log), 60_000);
setInterval(() => void runMaintenance(log), 60 * 60_000);

// Hourly heartbeat in the log, so gaps are visible when reading it later.
setInterval(() => {
  const idle = lastRecordAt ? Math.round((Date.now() - lastRecordAt) / 60_000) : -1;
  log(`heartbeat: ${records} records, ${messages} messages since start; last capture ${idle < 0 ? "never" : `${idle} min ago`}`);
}, 60 * 60_000);
