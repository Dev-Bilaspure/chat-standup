// Re-reads the raw captures still on disk (the last RAW_RETENTION_DAYS days) into the database, so parser
// fixes reach existing rows. Nothing is deleted: messages older than the raw window stay as they are.
// The database is backed up first. Run after improving the parser: pnpm reparse
import { RAW_RETENTION_DAYS, backupDatabase, getDb, rawFiles, replayRaw } from "@chat-notes/core";

const log = (m: string) => console.log(m);
const db = getDb();
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
const before = { messages: count("SELECT COUNT(*) AS n FROM messages"), users: count("SELECT COUNT(*) AS n FROM users") };

const backup = await backupDatabase(log, { force: true, name: `chat-notes-before-reparse-${Date.now()}.db` });
if (!backup) {
  console.error("Backup failed; not reparsing.");
  process.exit(1);
}

const files = rawFiles();
const started = Date.now();
const r = replayRaw();
console.log(`Re-read ${r.records} records from ${r.days} days of raw captures (${files[0]?.day ?? "none"} to ${files.at(-1)?.day ?? "none"}, keeping ${RAW_RETENTION_DAYS} days) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`  messages:      ${before.messages} → ${count("SELECT COUNT(*) AS n FROM messages")} (${r.messages} parsed, incl. duplicates)`);
console.log(`  users:         ${before.users} → ${count("SELECT COUNT(*) AS n FROM users")}`);
console.log(`  conversations: ${count("SELECT COUNT(*) AS n FROM conversations")} (${count("SELECT COUNT(*) AS n FROM conversations WHERE name IS NOT NULL")} named)`);
console.log(`  backup:        ${backup}`);
