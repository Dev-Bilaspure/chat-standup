// Keeps local storage bounded and the database safe, for months of continuous capture:
// - Raw captures (data/raw/YYYY-MM-DD.jsonl) are brotli-compressed once the day is over, after checking the
//   compressed copy reads back identical. Days older than RAW_RETENTION_DAYS are deleted, but only after
//   checking every message in them is in the database (missing ones are ingested first).
// - The database is backed up daily (SQLite online backup, checked with quick_check), keeping the last
//   BACKUP_DAILY days plus one per week for BACKUP_WEEKLY weeks.
// The database is the source of truth; raw captures exist to re-parse recent days after parser fixes.
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { DB_PATH, DATA_DIR, RAW_DIR, SPIKE_CAPTURE_DIR } from "./paths";
import { getDb } from "./db";
import { Ingestor } from "./ingest";
import { StreamParser, type CaptureRecord } from "./parse";
import { toDateStr } from "./time";

/** Days of raw captures to keep. Older days are deleted once verified to be in the database. */
export const RAW_RETENTION_DAYS = 30;
/** Database backups: one per day for this many days, then one per week for this many more weeks. */
export const BACKUP_DAILY = 7;
export const BACKUP_WEEKLY = 4;
export const BACKUP_DIR = path.join(DATA_DIR, "backups");

const BROTLI = {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 },
};
const brotli = promisify(zlib.brotliCompress);

type RawFile = { day: string; path: string; compressed: boolean; bytes: number };

/** Raw capture files, oldest day first. A day can have both a compressed file and a plain one (late appends). */
export function rawFiles(): RawFile[] {
  return [SPIKE_CAPTURE_DIR, RAW_DIR]
    .filter((d) => fs.existsSync(d))
    .flatMap((d) =>
      fs.readdirSync(d).flatMap((name) => {
        const m = name.match(/^(\d{4}-\d{2}-\d{2})\.jsonl(\.br)?$/);
        if (!m) return [];
        const p = path.join(d, name);
        return [{ day: m[1], path: p, compressed: !!m[2], bytes: fs.statSync(p).size }];
      }),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || Number(b.compressed) - Number(a.compressed));
}

function readLines(file: RawFile): CaptureRecord[] {
  const buf = fs.readFileSync(file.path);
  const text = (file.compressed ? zlib.brotliDecompressSync(buf) : buf).toString("utf8");
  const out: CaptureRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a partial line from an interrupted write
    }
  }
  return out;
}

/**
 * Calls fn for every raw record, oldest first, one day at a time (memory stays at one day's worth).
 * With `days`, only those days are read.
 */
export function forEachRawRecord(fn: (r: CaptureRecord) => void, opts: { days?: Set<string> } = {}): { records: number; days: number } {
  const byDay = new Map<string, RawFile[]>();
  for (const f of rawFiles()) if (!opts.days || opts.days.has(f.day)) byDay.set(f.day, [...(byDay.get(f.day) ?? []), f]);
  let records = 0;
  for (const files of byDay.values()) {
    const recs = files.flatMap(readLines).sort((a, b) => a.t - b.t || a.seq - b.seq);
    for (const r of recs) fn(r);
    records += recs.length;
  }
  return { records, days: byDay.size };
}

/** Compresses every finished day (before today). A day's plain lines are merged into its compressed file. */
export async function compressFinishedDays(log: (m: string) => void = () => {}): Promise<number> {
  const today = toDateStr(new Date());
  let done = 0;
  for (const plain of rawFiles().filter((f) => !f.compressed && f.day < today)) {
    const target = `${plain.path}.br`;
    const existing = fs.existsSync(target) ? zlib.brotliDecompressSync(fs.readFileSync(target)) : Buffer.alloc(0);
    const original = Buffer.concat([existing, fs.readFileSync(plain.path)]);
    const packed = await brotli(original, BROTLI);
    // Only replace the plain file once the compressed copy is proven to read back identical.
    if (!zlib.brotliDecompressSync(packed).equals(original)) {
      log(`compress ${plain.day}: read-back check failed, kept the plain file`);
      continue;
    }
    fs.writeFileSync(`${target}.tmp`, packed);
    fs.renameSync(`${target}.tmp`, target);
    fs.unlinkSync(plain.path);
    log(`compressed raw ${plain.day}: ${(original.length / 1e6).toFixed(1)} MB → ${(packed.length / 1e6).toFixed(1)} MB`);
    done++;
  }
  return done;
}

/**
 * Message ids a day's raw captures contain (blocked chats excluded) that aren't in the database.
 * Used before deleting the day, so deleting raw can never lose a message.
 */
function missingFromDb(day: string): string[] {
  const db = getDb();
  const blocked = new Set((db.prepare("SELECT conv_id FROM blocked_conversations").all() as { conv_id: string }[]).map((r) => r.conv_id));
  const has = db.prepare("SELECT 1 FROM messages WHERE id = ?");
  const parser = new StreamParser();
  const missing = new Set<string>();
  forEachRawRecord(
    (r) => {
      const p = parser.push(r);
      for (const m of p?.messages ?? []) if (!blocked.has(m.convId) && !has.get(m.id)) missing.add(m.id);
    },
    { days: new Set([day]) },
  );
  return [...missing];
}

/** Re-reads raw captures into the database without deleting anything (parser fixes reach existing rows). */
export function replayRaw(opts: { days?: Set<string>; onlyConv?: string } = {}): { records: number; days: number; messages: number } {
  const ingestor = new Ingestor({ replay: true, onlyConv: opts.onlyConv });
  let messages = 0;
  const r = forEachRawRecord((rec) => (messages += ingestor.ingest(rec)), { days: opts.days });
  return { ...r, messages };
}

/** Deletes raw days older than the retention window, after making sure their messages are in the database. */
export async function pruneOldRawDays(log: (m: string) => void = () => {}): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RAW_RETENTION_DAYS);
  const oldest = toDateStr(cutoff);
  const days = [...new Set(rawFiles().filter((f) => f.day < oldest).map((f) => f.day))];
  let pruned = 0;
  for (const day of days) {
    let missing = missingFromDb(day);
    if (missing.length) {
      log(`raw ${day}: ${missing.length} messages weren't in the database; ingesting them before deleting`);
      replayRaw({ days: new Set([day]) });
      missing = missingFromDb(day);
    }
    if (missing.length) {
      log(`raw ${day}: kept, ${missing.length} messages still not in the database`);
      continue;
    }
    for (const f of rawFiles().filter((x) => x.day === day)) fs.unlinkSync(f.path);
    log(`deleted raw ${day} (older than ${RAW_RETENTION_DAYS} days, all its messages are in the database)`);
    pruned++;
  }
  return pruned;
}

type Backup = { day: string; path: string; bytes: number };

export function listBackups(): Backup[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .flatMap((name) => {
      const m = name.match(/^chat-notes-(\d{4}-\d{2}-\d{2})\.db$/);
      return m ? [{ day: m[1], path: path.join(BACKUP_DIR, name), bytes: fs.statSync(path.join(BACKUP_DIR, name)).size }] : [];
    })
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Monday of the week a day is in, as a key for weekly backups. */
function weekOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toDateStr(date);
}

/** Today's backup if it's missing (verified with quick_check), then old backups beyond the policy are removed. */
export async function backupDatabase(log: (m: string) => void = () => {}, opts: { force?: boolean; name?: string } = {}): Promise<string | null> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const day = toDateStr(new Date());
  const dest = opts.name ? path.join(BACKUP_DIR, opts.name) : path.join(BACKUP_DIR, `chat-notes-${day}.db`);
  if (fs.existsSync(dest) && !opts.force) return null;

  const tmp = `${dest}.tmp`;
  await getDb().backup(tmp);
  // Make the copy a single self-contained file (no -wal/-shm next to it), then check it.
  const check = new Database(tmp);
  check.pragma("journal_mode = DELETE");
  const ok = (check.pragma("quick_check", { simple: true }) as string) === "ok";
  check.close();
  if (!ok) {
    fs.rmSync(tmp, { force: true });
    log("database backup failed its integrity check; not kept");
    return null;
  }
  fs.renameSync(tmp, dest);
  log(`backed up the database → ${path.basename(dest)} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);

  // Keep the newest BACKUP_DAILY days, plus the newest backup of each of the BACKUP_WEEKLY weeks before those.
  const all = listBackups();
  const daily = all.slice(0, BACKUP_DAILY);
  const keep = new Set(daily.map((b) => b.path));
  const weeks = new Map<string, Backup>();
  for (const b of all.slice(BACKUP_DAILY)) if (!weeks.has(weekOf(b.day))) weeks.set(weekOf(b.day), b);
  for (const b of [...weeks.values()].slice(0, BACKUP_WEEKLY)) keep.add(b.path);
  for (const b of all) if (!keep.has(b.path)) fs.unlinkSync(b.path);
  return dest;
}

let running = false;

/**
 * Daily housekeeping, safe to call often (it's quick when there's nothing to do): back up the database,
 * compress finished raw days, delete raw days past the retention window.
 */
export async function runMaintenance(log: (m: string) => void) {
  if (running) return;
  running = true;
  try {
    await backupDatabase(log);
    await compressFinishedDays(log);
    await pruneOldRawDays(log);
  } catch (err) {
    log(`maintenance error: ${(err as Error).message}`);
  } finally {
    running = false;
  }
}

export type StorageStats = {
  dbBytes: number;
  raw: { bytes: number; days: number; oldest: string | null; todayBytes: number };
  backups: { count: number; bytes: number; latest: string | null };
  freeBytes: number | null;
  retentionDays: number;
};

export function storageStats(): StorageStats {
  const size = (p: string) => (fs.existsSync(p) ? fs.statSync(p).size : 0);
  const files = rawFiles();
  const today = toDateStr(new Date());
  const backups = listBackups();
  let freeBytes: number | null = null;
  try {
    const s = fs.statfsSync(DATA_DIR);
    freeBytes = s.bavail * s.bsize;
  } catch {
    // not supported on this filesystem
  }
  return {
    dbBytes: size(DB_PATH) + size(`${DB_PATH}-wal`),
    raw: {
      bytes: files.reduce((n, f) => n + f.bytes, 0),
      days: new Set(files.map((f) => f.day)).size,
      oldest: files[0]?.day ?? null,
      todayBytes: files.filter((f) => f.day === today).reduce((n, f) => n + f.bytes, 0),
    },
    backups: { count: backups.length, bytes: backups.reduce((n, b) => n + b.bytes, 0), latest: backups[0]?.day ?? null },
    freeBytes,
    retentionDays: RAW_RETENTION_DAYS,
  };
}
