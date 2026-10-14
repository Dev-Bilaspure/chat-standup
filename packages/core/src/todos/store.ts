import { getDb, getSetting } from "../db";
import type { TokenUsage } from "../llm";
import type { Reference } from "../standup/references";

export type Todo = {
  id: number;
  runId: number | null;
  /** Added by hand, not found in chat: no details or sources. */
  manual: boolean;
  sourceDate: string;
  text: string;
  originalText: string;
  details: string[];
  references: Reference[];
  sourceIds: string[];
  askedBy: string | null;
  doneHintId: string | null;
  note: string;
  doneMs: number | null;
  doneBy: "chat" | "me" | null;
  createdMs: number;
  updatedMs: number;
  deletedMs: number | null;
};

export type TodoRun = {
  id: number;
  start: string;
  end: string;
  createdMs: number;
  model: string | null;
  durationMs: number | null;
  usage: TokenUsage | null;
  found: number;
  added: number;
  messages: number | null;
  error: string | null;
};

type TodoRow = {
  id: number;
  run_id: number | null;
  source_date: string;
  text: string;
  original_text: string;
  details: string;
  refs: string;
  source_ids: string;
  asked_by: string | null;
  done_hint_id: string | null;
  note: string;
  done_ms: number | null;
  done_by: string | null;
  created_ms: number;
  updated_ms: number;
  deleted_ms: number | null;
};

function toTodo(r: TodoRow): Todo {
  return {
    id: r.id,
    runId: r.run_id,
    manual: r.run_id === null,
    sourceDate: r.source_date,
    text: r.text,
    originalText: r.original_text,
    details: JSON.parse(r.details),
    references: JSON.parse(r.refs),
    sourceIds: JSON.parse(r.source_ids),
    askedBy: r.asked_by,
    doneHintId: r.done_hint_id,
    note: r.note,
    doneMs: r.done_ms,
    doneBy: r.done_by as Todo["doneBy"],
    createdMs: r.created_ms,
    updatedMs: r.updated_ms,
    deletedMs: r.deleted_ms,
  };
}

export function getTodo(id: number): Todo | null {
  const r = getDb().prepare("SELECT * FROM todos WHERE id = ?").get(id) as TodoRow | undefined;
  return r ? toTodo(r) : null;
}

/** Todos (not deleted), newest source day first. With from/to: only todos whose source day is in that range. */
export function listTodos(opts: { from?: string; to?: string } = {}): Todo[] {
  const where = ["deleted_ms IS NULL"];
  const args: string[] = [];
  if (opts.from) {
    where.push("source_date >= ?");
    args.push(opts.from);
  }
  if (opts.to) {
    where.push("source_date <= ?");
    args.push(opts.to);
  }
  const rows = getDb().prepare(`SELECT * FROM todos WHERE ${where.join(" AND ")} ORDER BY source_date DESC, id ASC`).all(...args) as TodoRow[];
  return rows.map(toTodo);
}

export function todoCounts(): { open: number; done: number } {
  const r = getDb().prepare("SELECT SUM(done_ms IS NULL) AS open, SUM(done_ms IS NOT NULL) AS done FROM todos WHERE deleted_ms IS NULL").get() as { open: number | null; done: number | null };
  return { open: r.open ?? 0, done: r.done ?? 0 };
}

export type TodoPatch = { text?: string; note?: string; done?: boolean; deleted?: boolean; resetText?: boolean; askedBy?: string | null };

/** Applies one change; returns the updated todo, or null if it doesn't exist. Empty text is rejected (keeps the old text). */
export function updateTodo(id: number, patch: TodoPatch): Todo | null {
  const db = getDb();
  const current = getTodo(id);
  if (!current) return null;
  const now = Date.now();
  const set: string[] = [];
  const args: (string | number | null)[] = [];
  const add = (sql: string, ...values: (string | number | null)[]) => {
    set.push(sql);
    args.push(...values);
  };

  if (typeof patch.text === "string" && patch.text.trim()) add("text = ?", patch.text.trim().slice(0, 500));
  if (patch.resetText) add("text = original_text");
  if (typeof patch.note === "string") add("note = ?", patch.note.slice(0, 50_000));
  if (typeof patch.done === "boolean") add("done_ms = ?, done_by = ?", patch.done ? now : null, patch.done ? "me" : null);
  if (typeof patch.deleted === "boolean") add("deleted_ms = ?", patch.deleted ? now : null);
  if (patch.askedBy !== undefined) add("asked_by = ?", patch.askedBy?.trim().slice(0, 120) || null);
  if (!set.length) return current;
  add("updated_ms = ?", now);
  db.prepare(`UPDATE todos SET ${set.join(", ")} WHERE id = ?`).run(...args, id);
  return getTodo(id);
}

/** Adds a todo by hand, for the given day. */
export function createTodo(input: { text: string; sourceDate: string; askedBy?: string | null }): Todo {
  const text = input.text.trim().slice(0, 500);
  if (!text) throw new Error("A todo can't be empty");
  const now = Date.now();
  const id = getDb()
    .prepare("INSERT INTO todos (run_id, source_date, text, original_text, asked_by, created_ms, updated_ms) VALUES (NULL, ?, ?, ?, ?, ?, ?)")
    .run(input.sourceDate, text, text, input.askedBy?.trim().slice(0, 120) || null, now, now).lastInsertRowid;
  return getTodo(Number(id))!;
}

/**
 * People to pick from for "from": everyone seen in chat (except you), most recently active first,
 * plus names already used on todos that aren't chat users (typed in by hand).
 */
export function listPeople(): string[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT u.name, MAX(m.created_us) AS last
      FROM users u LEFT JOIN messages m ON m.sender_id = u.id
      WHERE u.id != ? AND u.name IS NOT NULL AND u.name != '' AND u.name NOT LIKE '%@%' AND u.name NOT LIKE 'http%'
      GROUP BY u.id ORDER BY last IS NULL, last DESC, u.name`)
    .all(getSetting("self_id") ?? "") as { name: string }[];
  const names = [...new Set(rows.map((r) => r.name.trim()))];
  const known = new Set(names.map((n) => n.toLowerCase()));
  const used = db.prepare("SELECT DISTINCT asked_by FROM todos WHERE asked_by IS NOT NULL AND deleted_ms IS NULL").all() as { asked_by: string }[];
  // A todo's "from" is often a first name ("Priya"); only add names no chat user already covers.
  for (const { asked_by } of used) {
    const n = asked_by.trim().toLowerCase();
    if (!known.has(n) && !names.some((full) => full.toLowerCase().split(/\s+/)[0] === n)) names.push(asked_by.trim());
  }
  return names;
}

type RunRow = {
  id: number;
  start_date: string;
  end_date: string;
  created_ms: number;
  model: string | null;
  duration_ms: number | null;
  token_usage: string | null;
  input_stats: string | null;
  found: number;
  added: number;
  error: string | null;
};

function toRun(r: RunRow): TodoRun {
  return {
    id: r.id,
    start: r.start_date,
    end: r.end_date,
    createdMs: r.created_ms,
    model: r.model,
    durationMs: r.duration_ms,
    usage: r.token_usage ? JSON.parse(r.token_usage) : null,
    found: r.found,
    added: r.added,
    messages: r.input_stats ? (JSON.parse(r.input_stats).messages ?? null) : null,
    error: r.error,
  };
}

export function getTodoRun(id: number): TodoRun | null {
  const r = getDb().prepare("SELECT * FROM todo_runs WHERE id = ?").get(id) as RunRow | undefined;
  return r ? toRun(r) : null;
}

/** Runs whose period overlaps start..end, newest first. */
export function listTodoRuns(start: string, end: string): TodoRun[] {
  const rows = getDb().prepare("SELECT * FROM todo_runs WHERE start_date <= ? AND end_date >= ? ORDER BY created_ms DESC").all(end, start) as RunRow[];
  return rows.map(toRun);
}

/** The latest successful scan of exactly this day, if any. */
export function getDayRun(day: string): TodoRun | null {
  const r = getDb().prepare("SELECT * FROM todo_runs WHERE start_date = ? AND end_date = ? AND error IS NULL ORDER BY created_ms DESC LIMIT 1").get(day, day) as RunRow | undefined;
  return r ? toRun(r) : null;
}

/** Latest successful scan per day for the days in start..end that have one. */
export function scannedDays(start: string, end: string): Map<string, TodoRun> {
  const rows = getDb()
    .prepare("SELECT * FROM todo_runs WHERE start_date = end_date AND start_date BETWEEN ? AND ? AND error IS NULL ORDER BY created_ms ASC")
    .all(start, end) as RunRow[];
  return new Map(rows.map((r) => [r.start_date, toRun(r)]));
}
