import { getDb } from "../db";
import { generateJson, llmConfig } from "../llm";
import { extractReferences } from "../standup/references";
import { buildStandupInput } from "../standup/select";
import { toDateStr } from "../time";
import { TODO_PROMPT_VERSION, TODO_SCHEMA, todoPrompt } from "./prompt";
import { getDayRun } from "./store";

/** Later messages per chat shown to the model, so it can tell what already got done. */
const FOLLOW_UP = 15;

export type TodoRunResult = {
  day: string;
  runId: number;
  /** The day was already scanned: nothing was generated, its todos are the ones already in the list. */
  cached: boolean;
  /** Todos the model found in the period (including ones already on the list). */
  found: number;
  /** New todos added to the list. */
  added: number;
  /** Of the added ones, how many the chat shows were already done. */
  alreadyDone: number;
  /** Why nothing was found without asking the model, if that's the case. */
  emptyReason?: "no_messages";
  error?: string;
};

type RawTodo = { text: string; details?: string[]; askedBy?: string; refs?: string[]; doneRef?: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Scans in progress per day, so two requests for the same day (double click, two tabs) share one scan.
const globalForScans = globalThis as unknown as { __todoScans?: Map<string, Promise<TodoRunResult>> };
const inFlight = (globalForScans.__todoScans ??= new Map());

/**
 * Todos are found one day at a time. A day that was scanned successfully is never scanned again
 * (its todos are already in the list) unless `force` is set, e.g. after more of that day was captured.
 * Only past days: today is still in progress.
 */
export function findTodosForDay(day: string, opts: { force?: boolean } = {}): Promise<TodoRunResult> {
  if (day >= toDateStr(new Date())) return Promise.reject(new Error("Todos can only be found for past days (up to yesterday)."));
  const running = inFlight.get(day);
  if (running) return running;
  const done = !opts.force && getDayRun(day);
  if (done) return Promise.resolve({ day, runId: done.id, cached: true, found: done.found, added: done.added, alreadyDone: 0, emptyReason: done.messages === 0 ? "no_messages" : undefined });
  const scan = scanDay(day).finally(() => inFlight.delete(day));
  inFlight.set(day, scan);
  return scan;
}

/** Reads one day's chats, adds the new todos to the list, and records the run (also on failure). */
async function scanDay(day: string): Promise<TodoRunResult> {
  const start = day;
  const end = day;

  const db = getDb();
  const insertRun = db.prepare(`
    INSERT INTO todo_runs (start_date, end_date, created_ms, provider, model, prompt_version, input_stats, input_text, output, duration_ms, cost_usd, token_usage, found, added, error)
    VALUES (@start, @end, @created, @provider, @model, @version, @stats, @input, @output, @duration, @cost, @usage, @found, @added, @error)`);
  const run = { start, end, created: Date.now(), version: TODO_PROMPT_VERSION, provider: null as string | null, model: null as string | null, stats: null as string | null, input: null as string | null, output: null as string | null, duration: null as number | null, cost: null as number | null, usage: null as string | null, found: 0, added: 0, error: null as string | null };

  try {
    const input = buildStandupInput(start, end, { followUp: FOLLOW_UP });
    run.stats = JSON.stringify(input.stats);
    // Nothing involving the user in this period: there can't be todos, no need to ask the model.
    if (!input.stats.messages) {
      const runId = Number(insertRun.run(run).lastInsertRowid);
      return { day, runId, cached: false, found: 0, added: 0, alreadyDone: 0, emptyReason: "no_messages" };
    }

    // Todos already on the list that come from these messages: the model shouldn't repeat them.
    const inputIds = new Set(Object.values(input.refs));
    const existing = (db.prepare("SELECT id, text, original_text, source_ids FROM todos WHERE deleted_ms IS NULL").all() as { id: number; text: string; original_text: string; source_ids: string }[])
      .map((t) => ({ ...t, sources: JSON.parse(t.source_ids) as string[] }))
      .filter((t) => t.sources.some((id) => inputIds.has(id)));

    const p = todoPrompt(input.self.name, start, end, existing.map((t) => t.text));
    const user = `${p.header}\n\n${input.text}`;
    run.input = user;
    const cfg = llmConfig();
    run.provider = cfg.provider;
    run.model = cfg.model;

    const res = await generateJson({ system: p.system, user, schema: TODO_SCHEMA, schemaName: "todos" });
    Object.assign(run, { provider: res.provider, model: res.model, output: JSON.stringify(res.data), duration: res.durationMs, cost: res.costUsd ?? null, usage: res.usage ? JSON.stringify(res.usage) : null });
    const raw = res.data as { hasTodos?: boolean; todos?: RawTodo[] };
    const todos = raw.hasTodos === false ? [] : (raw.todos ?? []).filter((t) => t.text?.trim());
    run.found = todos.length;

    // Skip what's already on the list: same wording, or every source already behind one existing todo.
    const knownTexts = new Set(existing.flatMap((t) => [norm(t.text), norm(t.original_text)]));
    const message = db.prepare("SELECT text, created_us FROM messages WHERE id = ?");
    const fresh = todos
      .map((t) => {
        const sourceIds = [...new Set((t.refs ?? []).map((r) => input.refs[r]).filter(Boolean))];
        const doneHintId = (t.doneRef && input.refs[t.doneRef]) || null;
        return { t, sourceIds, doneHintId };
      })
      .filter(({ t, sourceIds }) => !knownTexts.has(norm(t.text)) && !(sourceIds.length && existing.some((e) => sourceIds.every((id) => e.sources.includes(id)))));

    const insertTodo = db.prepare(`
      INSERT INTO todos (run_id, source_date, text, original_text, details, refs, source_ids, asked_by, done_hint_id, done_ms, done_by, created_ms, updated_ms)
      VALUES (@runId, @sourceDate, @text, @text, @details, @refs, @sourceIds, @askedBy, @doneHintId, @doneMs, @doneBy, @now, @now)`);

    let alreadyDone = 0;
    const runId = db.transaction(() => {
      run.added = fresh.length;
      const id = Number(insertRun.run(run).lastInsertRowid);
      const now = Date.now();
      for (const { t, sourceIds, doneHintId } of fresh) {
        const rows = sourceIds.map((sid) => message.get(sid) as { text: string; created_us: number } | undefined).filter((r) => r !== undefined);
        // Day of the earliest source message inside the period (context messages can be older).
        const inPeriod = rows.map((r) => toDateStr(new Date(r.created_us / 1000))).filter((d) => d >= start && d <= end).sort();
        if (doneHintId) alreadyDone++;
        insertTodo.run({
          runId: id,
          sourceDate: inPeriod[0] ?? end,
          text: t.text.trim(),
          details: JSON.stringify((t.details ?? []).map((d) => d.trim()).filter(Boolean)),
          refs: JSON.stringify(extractReferences(rows.map((r) => r.text))),
          sourceIds: JSON.stringify(sourceIds),
          askedBy: t.askedBy?.trim() || null,
          doneHintId,
          doneMs: doneHintId ? now : null,
          doneBy: doneHintId ? "chat" : null,
          now,
        });
      }
      return id;
    })();
    return { day, runId, cached: false, found: run.found, added: run.added, alreadyDone };
  } catch (err) {
    run.error = (err as Error).message;
    const runId = Number(insertRun.run(run).lastInsertRowid);
    return { day, runId, cached: false, found: 0, added: 0, alreadyDone: 0, error: run.error };
  }
}
