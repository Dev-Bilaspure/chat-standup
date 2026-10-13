// Summarizes spike/llm/out/*.json: latency, token overhead, cost, and the operations returned.
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "out");
const names = fs.readdirSync(OUT).filter((f) => f.endsWith(".json") && !f.endsWith(".meta.json")).map((f) => f.replace(/\.json$/, ""));

for (const name of names) {
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, `${name}.meta.json`), "utf8"));
  const raw = fs.readFileSync(path.join(OUT, `${name}.json`), "utf8");
  const err = fs.readFileSync(path.join(OUT, `${name}.err`), "utf8").trim();
  console.log(`\n━━ ${name}  (wall ${(meta.wall_ms / 1000).toFixed(1)}s, exit ${meta.exit})`);
  let r: any;
  try {
    r = JSON.parse(raw);
  } catch {
    console.log(`  could not parse output: ${raw.slice(0, 300)} ${err.slice(0, 300)}`);
    continue;
  }
  const u = r.usage ?? {};
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const models = Object.keys(r.modelUsage ?? {}).join(", ");
  console.log(`  model ${models || "?"} | api ${((r.duration_api_ms ?? 0) / 1000).toFixed(1)}s | turns ${r.num_turns} | input ${input} tok (cache read ${u.cache_read_input_tokens ?? 0}) | output ${u.output_tokens ?? 0} tok | ~$${(r.total_cost_usd ?? 0).toFixed(4)}`);
  const result = r.structured_output ?? (() => {
    try {
      return JSON.parse(r.result);
    } catch {
      return null;
    }
  })();
  if (!result?.ops) {
    console.log(`  no structured output. result: ${String(r.result).slice(0, 300)}`);
    continue;
  }
  for (const o of result.ops) {
    const what = [o.item_id, o.type, o.title && JSON.stringify(o.title), o.owner && `owner=${o.owner}`, o.due && `due=${o.due}`].filter(Boolean).join(" ");
    console.log(`  ${o.op.padEnd(8)} ${what}  conf=${o.confidence} ev=[${(o.evidence ?? []).join(",")}]`);
  }
}
