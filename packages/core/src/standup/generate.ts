import { codeItemLink, codeItemSummary, collectCodeActivity, renderCodeActivity, type CodeItem } from "../code/activity";
import { getDb } from "../db";
import { generateJson, llmConfig } from "../llm";
import { rangeBounds } from "../time";
import type { UpdatesOutput } from "./output";
import { PROMPT_VERSION, STANDUP_SCHEMA, dailyPrompt, rangePrompt } from "./prompt";
import { extractReferences, type Reference } from "./references";
import { buildStandupInput, type InputStats } from "./select";

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

    // Your commits, PRs and reviews from git and GitHub, if set up in chat-notes.config.json.
    const [fromMs, toMs] = rangeBounds(start, end);
    const code = await collectCodeActivity(fromMs, toMs);
    const rendered = code?.items.length ? renderCodeActivity(code, fromMs, toMs) : null;
    if (code) stats.code = { items: code.items.length, commits: code.commits, errors: code.errors };
    base.stats = JSON.stringify(stats);
    if (!input.stats.messages && !rendered) throw new Error(`No messages involving you (or code activity) were captured for ${start === end ? start : `${start} to ${end}`}.`);

    const p = kind === "daily" ? dailyPrompt(input.self.name, start) : rangePrompt(input.self.name, start, end);
    const chat = input.stats.messages ? input.text : "(no chat messages involving you in this period)";
    const user = `${p.header}\n\n${chat}${rendered ? `\n\n## Your code activity (from git and GitHub)\n${rendered.text}` : ""}`;
    base.input = user;
    const cfg = llmConfig();
    base.provider = cfg.provider;
    base.model = cfg.model;

    const res = await generateJson({ system: p.system, user, schema: STANDUP_SCHEMA, schemaName: "standup" });
    const raw = res.data as { updates?: { text: string; details?: string[]; refs?: string[] }[] };
    const codeRefs: Record<string, CodeItem> = rendered?.refs ?? {};

    // References come from the full text of the messages each update cites, not from the model.
    const textOf = db.prepare("SELECT text FROM messages WHERE id = ?");
    const output: UpdatesOutput = {
      format: 2,
      updates: (raw.updates ?? []).map((u) => {
        const sourceIds = [...new Set((u.refs ?? []).map((r) => input.refs[r]).filter(Boolean))];
        const texts = sourceIds.map((id) => (textOf.get(id) as { text: string } | undefined)?.text ?? "");
        const items = [...new Set(u.refs ?? [])].map((r) => codeRefs[r]).filter((i): i is CodeItem => !!i);
        return {
          text: u.text.trim(),
          details: (u.details ?? []).map((d) => d.trim()).filter(Boolean),
          references: mergeReferences(items.flatMap(codeItemLink), extractReferences(texts)),
          sourceIds,
          ...(items.length ? { code: items.map((i) => codeItemSummary(i, toMs)) } : {}),
        };
      }),
    };

    return Number(insert.run({ ...base, provider: res.provider, model: res.model, output: JSON.stringify(output), duration: res.durationMs, cost: res.costUsd ?? null, usage: res.usage ? JSON.stringify(res.usage) : null }).lastInsertRowid);
  } catch (err) {
    return Number(insert.run({ ...base, error: (err as Error).message }).lastInsertRowid);
  }
}

/** Code links first, then those found in messages; one chip per link. */
function mergeReferences(code: Reference[], fromMessages: Reference[]): Reference[] {
  const seen = new Set<string>();
  const out: Reference[] = [];
  for (const r of [...code, ...fromMessages]) {
    const key = (r.url ?? r.label).replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  const order = { pr: 0, jira: 1, doc: 2, link: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}
