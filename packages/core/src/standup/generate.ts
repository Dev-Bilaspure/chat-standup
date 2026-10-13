import { getDb } from "../db";
import { generateJson, llmConfig } from "../llm";
import { PROMPT_VERSION, SECTIONS, STANDUP_SCHEMA, dailyPrompt, rangePrompt, type SectionKey } from "./prompt";
import { buildStandupInput, type InputStats } from "./select";

export type Bullet = { text: string; sourceIds: string[] };
export type StandupOutput = Record<SectionKey, Bullet[]>;
export type Kind = "daily" | "range";

/** Generates a stand-up and stores it (also on failure, so failures count in the evaluation). Returns the generation id. */
export async function generateStandup(kind: Kind, start: string, end: string): Promise<number> {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO generations (kind, start_date, end_date, created_ms, provider, model, prompt_version, input_stats, input_text, output, duration_ms, cost_usd, token_usage, error)
    VALUES (@kind, @start, @end, @created, @provider, @model, @version, @stats, @input, @output, @duration, @cost, @usage, @error)`);
  const base = { kind, start, end, created: Date.now(), version: PROMPT_VERSION, provider: null as string | null, model: null as string | null, stats: null as string | null, input: null as string | null, output: null as string | null, duration: null as number | null, cost: null as number | null, usage: null as string | null, error: null as string | null };

  let stats: InputStats | undefined;
  try {
    const input = buildStandupInput(start, end);
    stats = input.stats;
    base.stats = JSON.stringify(stats);
    if (!input.stats.messages) throw new Error(`No messages involving you were captured for ${start === end ? start : `${start} to ${end}`}.`);

    const p = kind === "daily" ? dailyPrompt(input.self.name, start) : rangePrompt(input.self.name, start, end);
    const user = `${p.header}\n\n${input.text}`;
    base.input = user;
    const cfg = llmConfig();
    base.provider = cfg.provider;
    base.model = cfg.model;

    const res = await generateJson({ system: p.system, user, schema: STANDUP_SCHEMA, schemaName: "standup" });
    const raw = res.data as Record<string, { text: string; refs: string[] }[]>;
    const output = Object.fromEntries(
      SECTIONS.map((s) => [s.key, (raw[s.key] ?? []).map((b) => ({ text: b.text, sourceIds: (b.refs ?? []).map((r) => input.refs[r]).filter(Boolean) }))]),
    ) as StandupOutput;

    return Number(insert.run({ ...base, provider: res.provider, model: res.model, output: JSON.stringify(output), duration: res.durationMs, cost: res.costUsd ?? null, usage: res.usage ? JSON.stringify(res.usage) : null }).lastInsertRowid);
  } catch (err) {
    return Number(insert.run({ ...base, error: (err as Error).message }).lastInsertRowid);
  }
}

export function standupToText(output: StandupOutput): string {
  return SECTIONS.filter((s) => output[s.key]?.length)
    .map((s) => `${s.title}\n${output[s.key].map((b) => `- ${b.text}`).join("\n")}`)
    .join("\n\n");
}
