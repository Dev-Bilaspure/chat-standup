import fs from "node:fs";
import Database from "better-sqlite3";
import { DATA_DIR, DB_PATH } from "./paths";

export type DB = Database.Database;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE messages (
    id            TEXT PRIMARY KEY,
    conv_id       TEXT NOT NULL,
    topic_id      TEXT,
    sender_id     TEXT,
    text          TEXT NOT NULL DEFAULT '',
    created_us    INTEGER NOT NULL,
    updated_us    INTEGER NOT NULL,
    source        TEXT NOT NULL,          -- history | sent | live
    first_seen_ms INTEGER NOT NULL,
    last_seen_ms  INTEGER NOT NULL
  );
  CREATE INDEX messages_created ON messages(created_us);
  CREATE INDEX messages_conv ON messages(conv_id, created_us);

  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, updated_ms INTEGER);
  CREATE TABLE conversations (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT, updated_ms INTEGER);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

  -- Capture activity per minute: shows when the extension was running (data coverage).
  CREATE TABLE capture_minutes (minute INTEGER PRIMARY KEY, records INTEGER NOT NULL);

  CREATE TABLE generations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    kind           TEXT NOT NULL,         -- daily | range
    start_date     TEXT NOT NULL,         -- YYYY-MM-DD (local)
    end_date       TEXT NOT NULL,
    created_ms     INTEGER NOT NULL,
    provider       TEXT,
    model          TEXT,
    prompt_version TEXT NOT NULL,
    input_stats    TEXT,                  -- JSON
    input_text     TEXT,                  -- exact text sent to the model (for reproducibility)
    output         TEXT,                  -- JSON (bullets with message ids)
    duration_ms    INTEGER,
    cost_usd       REAL,
    error          TEXT
  );

  CREATE TABLE feedback (
    generation_id INTEGER PRIMARY KEY REFERENCES generations(id),
    rating        INTEGER,                -- 1..5
    usage         TEXT,                   -- as_is | minor_edits | major_edits | not_used
    missing       TEXT,                   -- what it should have included
    wrong         TEXT,                   -- wrong or irrelevant bullets
    final_text    TEXT,                   -- what you actually sent
    updated_ms    INTEGER NOT NULL
  );
  `,
  // Per-bullet judgement: JSON array of bullet keys like "done:2" marked wrong or irrelevant.
  `ALTER TABLE feedback ADD COLUMN wrong_bullets TEXT;`,
  // Soft delete: deleted generations go to Trash and are excluded everywhere else.
  `ALTER TABLE generations ADD COLUMN deleted_ms INTEGER;
   CREATE INDEX generations_period ON generations(start_date, end_date);`,
  // Token usage per generation (JSON, see TokenUsage).
  `ALTER TABLE generations ADD COLUMN token_usage TEXT;`,
];

function migrate(db: DB) {
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

const globalForDb = globalThis as unknown as { __chatNotesDb?: DB };

/** Shared connection (cached on globalThis so Next.js dev reloads don't open new ones). */
export function getDb(): DB {
  if (globalForDb.__chatNotesDb) return globalForDb.__chatNotesDb;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  globalForDb.__chatNotesDb = db;
  return db;
}

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
