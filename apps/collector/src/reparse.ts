// Rebuilds messages, users, conversations and capture activity from all raw captures.
// Generations and feedback are kept. Run after improving the parser: pnpm reparse
import fs from "node:fs";
import path from "node:path";
import { Ingestor, RAW_DIR, SPIKE_CAPTURE_DIR, getDb, type CaptureRecord } from "@chat-notes/core";

const files = [SPIKE_CAPTURE_DIR, RAW_DIR]
  .filter((d) => fs.existsSync(d))
  .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(d, f)));

const records: CaptureRecord[] = [];
for (const f of files) {
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // skip partial line
    }
  }
}
// Stable order: by time, then by per-page sequence.
records.sort((a, b) => a.t - b.t || a.seq - b.seq);

const db = getDb();
db.exec("DELETE FROM messages; DELETE FROM users; DELETE FROM conversations; DELETE FROM capture_minutes;");
const ingestor = new Ingestor();
const started = Date.now();
let found = 0;
for (const r of records) found += ingestor.ingest(r);

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
console.log(`Reparsed ${records.length} records from ${files.length} files in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`  messages:      ${count("SELECT COUNT(*) AS n FROM messages")} unique (${found} parsed incl. duplicates)`);
console.log(`    by source:   ${(db.prepare("SELECT source, COUNT(*) AS n FROM messages GROUP BY source").all() as { source: string; n: number }[]).map((r) => `${r.source} ${r.n}`).join(", ")}`);
console.log(`  users:         ${count("SELECT COUNT(*) AS n FROM users")}`);
console.log(`  conversations: ${count("SELECT COUNT(*) AS n FROM conversations")} (${count("SELECT COUNT(*) AS n FROM conversations WHERE name IS NOT NULL")} named)`);
console.log(`  self id:       ${(db.prepare("SELECT value FROM settings WHERE key = 'self_id'").get() as { value: string } | undefined)?.value ?? "unknown"}`);
