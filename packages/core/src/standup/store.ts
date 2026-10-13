import { getDb } from "../db";
import type { TokenUsage } from "../llm";
import type { Kind, StandupOutput } from "./generate";
import type { InputStats } from "./select";

export type Usage = "as_is" | "minor_edits" | "major_edits" | "not_used";
export const USAGE_LABELS: Record<Usage, string> = {
  as_is: "Used as-is",
  minor_edits: "Minor edits",
  major_edits: "Major edits",
  not_used: "Didn't use",
};

export type Feedback = { rating: number | null; usage: Usage | null; missing: string; wrong: string; wrongBullets: string[]; finalText: string; updatedMs: number };
export type Generation = {
  id: number;
  kind: Kind;
  start: string;
  end: string;
  createdMs: number;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  stats: InputStats | null;
  inputText: string | null;
  output: StandupOutput | null;
  durationMs: number | null;
  costUsd: number | null;
  /** Null for generations made before usage was recorded, or that failed before calling the model. */
  usage: TokenUsage | null;
  error: string | null;
  deletedMs: number | null;
  feedback: Feedback | null;
};

type GenRow = {
  id: number; kind: Kind; start_date: string; end_date: string; created_ms: number; provider: string | null; model: string | null; prompt_version: string;
  input_stats: string | null; input_text: string | null; output: string | null; duration_ms: number | null; cost_usd: number | null; error: string | null; deleted_ms: number | null; token_usage: string | null;
  rating: number | null; usage: Usage | null; missing: string | null; wrong: string | null; wrong_bullets: string | null; final_text: string | null; updated_ms: number | null;
};

const SELECT = `SELECT g.*, f.rating, f.usage, f.missing, f.wrong, f.wrong_bullets, f.final_text, f.updated_ms FROM generations g LEFT JOIN feedback f ON f.generation_id = g.id`;

function toGeneration(r: GenRow): Generation {
  return {
    id: r.id,
    kind: r.kind,
    start: r.start_date,
    end: r.end_date,
    createdMs: r.created_ms,
    provider: r.provider,
    model: r.model,
    promptVersion: r.prompt_version,
    stats: r.input_stats ? JSON.parse(r.input_stats) : null,
    inputText: r.input_text,
    output: r.output ? JSON.parse(r.output) : null,
    durationMs: r.duration_ms,
    costUsd: r.cost_usd,
    usage: r.token_usage ? JSON.parse(r.token_usage) : null,
    error: r.error,
    deletedMs: r.deleted_ms,
    feedback: r.updated_ms ? { rating: r.rating, usage: r.usage, missing: r.missing ?? "", wrong: r.wrong ?? "", wrongBullets: r.wrong_bullets ? JSON.parse(r.wrong_bullets) : [], finalText: r.final_text ?? "", updatedMs: r.updated_ms } : null,
  };
}

export function getGeneration(id: number): Generation | null {
  const r = getDb().prepare(`${SELECT} WHERE g.id = ?`).get(id) as GenRow | undefined;
  return r ? toGeneration(r) : null;
}

/** Non-deleted generations, newest first; optionally for an exact kind/period. */
export function listGenerations(filter?: { kind?: Kind; start?: string; end?: string }): Generation[] {
  return queryGenerations({ kind: filter?.kind, exactStart: filter?.start, exactEnd: filter?.end, limit: 10_000 }).items;
}

export type GenerationStatus = "all" | "needs_feedback" | "rated" | "failed" | "trash";
export type GenerationSort = "created" | "period" | "rating";
export type GenerationQuery = {
  kind?: Kind;
  status?: GenerationStatus;
  /** Free text, matched against bullets, errors and period dates. */
  q?: string;
  /** Periods overlapping [from, to] (YYYY-MM-DD). */
  from?: string;
  to?: string;
  exactStart?: string;
  exactEnd?: string;
  sort?: GenerationSort;
  limit?: number;
  offset?: number;
};

export function queryGenerations(q: GenerationQuery): { items: Generation[]; total: number } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (sql: string, ...a: (string | number)[]) => (where.push(sql), args.push(...a));

  add(q.status === "trash" ? "g.deleted_ms IS NOT NULL" : "g.deleted_ms IS NULL");
  if (q.status === "needs_feedback") add("g.error IS NULL AND f.updated_ms IS NULL");
  if (q.status === "rated") add("f.rating IS NOT NULL");
  if (q.status === "failed") add("g.error IS NOT NULL");
  if (q.kind) add("g.kind = ?", q.kind);
  if (q.exactStart) add("g.start_date = ?", q.exactStart);
  if (q.exactEnd) add("g.end_date = ?", q.exactEnd);
  if (q.from) add("g.end_date >= ?", q.from);
  if (q.to) add("g.start_date <= ?", q.to);
  if (q.q?.trim()) {
    const like = `%${q.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    add("(g.output LIKE ? ESCAPE '\\' OR g.error LIKE ? ESCAPE '\\' OR g.start_date LIKE ? OR g.end_date LIKE ?)", like, like, like, like);
  }

  const order = {
    created: "g.created_ms DESC",
    period: "g.end_date DESC, g.start_date DESC, g.created_ms DESC",
    rating: "f.rating IS NULL, f.rating DESC, g.created_ms DESC",
  }[q.sort ?? "created"];
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM generations g LEFT JOIN feedback f ON f.generation_id = g.id ${whereSql}`).get(...args) as { n: number }).n;
  const rows = db.prepare(`${SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, q.limit ?? 50, q.offset ?? 0) as GenRow[];
  return { items: rows.map(toGeneration), total };
}

/** Counts per status (non-deleted, except trash), for filter labels. */
export function generationCounts(): Record<GenerationStatus, number> {
  const r = getDb()
    .prepare(`
      SELECT
        SUM(g.deleted_ms IS NULL) AS all_,
        SUM(g.deleted_ms IS NULL AND g.error IS NULL AND f.updated_ms IS NULL) AS needs_feedback,
        SUM(g.deleted_ms IS NULL AND f.rating IS NOT NULL) AS rated,
        SUM(g.deleted_ms IS NULL AND g.error IS NOT NULL) AS failed,
        SUM(g.deleted_ms IS NOT NULL) AS trash
      FROM generations g LEFT JOIN feedback f ON f.generation_id = g.id`)
    .get() as Record<string, number | null>;
  return { all: r.all_ ?? 0, needs_feedback: r.needs_feedback ?? 0, rated: r.rated ?? 0, failed: r.failed ?? 0, trash: r.trash ?? 0 };
}

/** Moves generations to Trash (reversible). */
export function trashGenerations(ids: number[]) {
  const stmt = getDb().prepare("UPDATE generations SET deleted_ms = ? WHERE id = ? AND deleted_ms IS NULL");
  const now = Date.now();
  getDb().transaction(() => ids.forEach((id) => stmt.run(now, id)))();
}

export function restoreGenerations(ids: number[]) {
  const stmt = getDb().prepare("UPDATE generations SET deleted_ms = NULL WHERE id = ?");
  getDb().transaction(() => ids.forEach((id) => stmt.run(id)))();
}

/** Permanently deletes generations (and their feedback). Only items already in Trash; returns how many were deleted. */
export function purgeGenerations(ids: number[]): number {
  const db = getDb();
  let deleted = 0;
  db.transaction(() => {
    for (const id of ids) {
      const row = db.prepare("SELECT deleted_ms FROM generations WHERE id = ?").get(id) as { deleted_ms: number | null } | undefined;
      if (!row?.deleted_ms) continue;
      db.prepare("DELETE FROM feedback WHERE generation_id = ?").run(id);
      db.prepare("DELETE FROM generations WHERE id = ?").run(id);
      deleted++;
    }
  })();
  return deleted;
}

export function saveFeedback(id: number, f: Omit<Feedback, "updatedMs">) {
  getDb()
    .prepare(`
      INSERT INTO feedback (generation_id, rating, usage, missing, wrong, wrong_bullets, final_text, updated_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(generation_id) DO UPDATE SET rating = excluded.rating, usage = excluded.usage, missing = excluded.missing,
        wrong = excluded.wrong, wrong_bullets = excluded.wrong_bullets, final_text = excluded.final_text, updated_ms = excluded.updated_ms`)
    .run(id, f.rating, f.usage, f.missing, f.wrong, JSON.stringify(f.wrongBullets), f.finalText, Date.now());
}

export type SourceMessage = { id: string; convName: string; senderName: string; mine: boolean; text: string; createdMs: number };

export function getMessages(ids: string[], selfId?: string): Map<string, SourceMessage> {
  const out = new Map<string, SourceMessage>();
  if (!ids.length) return out;
  const rows = getDb()
    .prepare(`
      SELECT m.id, m.text, m.created_us, m.sender_id, c.name AS conv_name, c.kind AS conv_kind, u.name AS sender_name
      FROM messages m LEFT JOIN conversations c ON c.id = m.conv_id LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as { id: string; text: string; created_us: number; sender_id: string; conv_name: string | null; conv_kind: string | null; sender_name: string | null }[];
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      convName: r.conv_kind === "dm" ? `DM · ${r.conv_name ?? "unknown"}` : (r.conv_name ?? "unknown chat"),
      senderName: r.sender_name ?? "Unknown",
      mine: r.sender_id === selfId,
      text: r.text,
      createdMs: Math.floor(r.created_us / 1000),
    });
  }
  return out;
}
