// LLM providers behind one call: structured JSON in, structured JSON out.
//   LLM_PROVIDER=claude-code (default) — headless Claude Code on your subscription, lean mode
//   LLM_PROVIDER=openai                — needs OPENAI_API_KEY and LLM_MODEL
// LLM_MODEL defaults to "sonnet" for claude-code.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA_DIR } from "./paths";

export type LlmRequest = { system: string; user: string; schema: object; schemaName: string };
/** Every token the request consumed. Cache writes/reads are input tokens billed differently. */
export type TokenUsage = {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  /** Included in output; reported separately when the model thinks. */
  thinking: number;
  total: number;
  /** Claude Code can call more than one model in a session (e.g. a small model for housekeeping). */
  byModel: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number; total: number }>;
};
export type LlmResult = { data: unknown; provider: string; model: string; durationMs: number; costUsd?: number; usage?: TokenUsage };

function sumUsage(byModel: TokenUsage["byModel"], thinking: number): TokenUsage {
  const t = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const m of Object.values(byModel)) {
    t.input += m.input;
    t.cacheWrite += m.cacheWrite;
    t.cacheRead += m.cacheRead;
    t.output += m.output;
  }
  return { ...t, thinking, total: t.input + t.cacheWrite + t.cacheRead + t.output, byModel };
}

export function llmConfig() {
  const provider = process.env.LLM_PROVIDER ?? "claude-code";
  const model = process.env.LLM_MODEL ?? (provider === "claude-code" ? "sonnet" : "");
  return { provider, model };
}

export async function generateJson(req: LlmRequest): Promise<LlmResult> {
  const { provider, model } = llmConfig();
  if (provider === "claude-code") return claudeCode(req, model);
  if (provider === "openai") return openai(req, model);
  throw new Error(`Unknown LLM_PROVIDER "${provider}"`);
}

function claudeBinary(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const local = path.join(os.homedir(), ".local/bin/claude");
  return fs.existsSync(local) ? local : "claude";
}

async function claudeCode(req: LlmRequest, model: string): Promise<LlmResult> {
  // Lean mode: our system prompt replaces Claude Code's, no tools, no settings/MCP/CLAUDE.md context.
  const args = [
    "-p",
    "--output-format", "json",
    "--no-session-persistence",
    "--model", model,
    "--system-prompt", req.system,
    "--json-schema", JSON.stringify(req.schema),
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
  ];
  // Run from an empty directory so no project files are picked up as context.
  const cwd = path.join(DATA_DIR, "llm-workdir");
  fs.mkdirSync(cwd, { recursive: true });
  const started = Date.now();

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(claudeBinary(), args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Claude Code timed out after 5 minutes"));
    }, 5 * 60_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start Claude Code (${claudeBinary()}): ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`Claude Code exited with ${code}: ${(err || out).slice(0, 500)}`));
    });
    child.stdin.end(req.user);
  });

  const res = JSON.parse(stdout);
  if (res.is_error) throw new Error(`Claude Code error: ${String(res.result).slice(0, 500)}`);
  let data = res.structured_output;
  if (data === undefined) {
    try {
      data = JSON.parse(res.result);
    } catch {
      throw new Error(`Claude Code returned no structured output: ${String(res.result).slice(0, 300)}`);
    }
  }
  // modelUsage covers every call in the session, per model; usage is a fallback for older versions.
  const byModel: TokenUsage["byModel"] = {};
  let thinking = 0;
  for (const [name, m] of Object.entries((res.modelUsage ?? {}) as Record<string, Record<string, number>>)) {
    const e = { input: m.inputTokens ?? 0, cacheWrite: m.cacheCreationInputTokens ?? 0, cacheRead: m.cacheReadInputTokens ?? 0, output: m.outputTokens ?? 0 };
    byModel[name] = { ...e, total: e.input + e.cacheWrite + e.cacheRead + e.output };
    thinking += m.thinkingTokens ?? 0;
  }
  if (!Object.keys(byModel).length && res.usage) {
    const u = res.usage;
    const e = { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 };
    byModel[model] = { ...e, total: e.input + e.cacheWrite + e.cacheRead + e.output };
    thinking = u.output_tokens_details?.thinking_tokens ?? 0;
  }
  // The main model is the one that produced the most output.
  const main = Object.entries(byModel).sort((a, b) => b[1].output - a[1].output)[0]?.[0];

  return {
    data,
    provider: "claude-code",
    model: main ?? model,
    durationMs: Date.now() - started,
    costUsd: typeof res.total_cost_usd === "number" ? res.total_cost_usd : undefined,
    usage: Object.keys(byModel).length ? sumUsage(byModel, thinking) : undefined,
  };
}

async function openai(req: LlmRequest, model: string): Promise<LlmResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("LLM_PROVIDER=openai needs OPENAI_API_KEY");
  if (!model) throw new Error("LLM_PROVIDER=openai needs LLM_MODEL");
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: req.schema, strict: true } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(body).slice(0, 500)}`);
  const u = body.usage ?? {};
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  const m = body.model ?? model;
  const entry = { input: (u.prompt_tokens ?? 0) - cached, cacheWrite: 0, cacheRead: cached, output: u.completion_tokens ?? 0 };
  return {
    data: JSON.parse(body.choices[0].message.content),
    provider: "openai",
    model: m,
    durationMs: Date.now() - started,
    usage: sumUsage({ [m]: { ...entry, total: entry.input + entry.cacheRead + entry.output } }, u.completion_tokens_details?.reasoning_tokens ?? 0),
  };
}
