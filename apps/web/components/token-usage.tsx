import type { TokenUsage } from "@chat-notes/core";
import { compact } from "@/lib/format";

/** Full token breakdown for one generation: everything the model call consumed, not just output. */
export function TokenUsageRow({ usage }: { usage: TokenUsage | null }) {
  if (!usage) return <p className="text-xs text-muted-foreground">Token usage wasn&apos;t recorded for this one (generated before tracking was added).</p>;
  const parts = [
    { label: "input", value: usage.input, hint: "Uncached input tokens" },
    { label: "cache write", value: usage.cacheWrite, hint: "Input tokens written to the prompt cache (most of the prompt on a first call)" },
    { label: "cache read", value: usage.cacheRead, hint: "Input tokens served from the prompt cache" },
    { label: "output", value: usage.output, hint: usage.thinking ? `Includes ${usage.thinking.toLocaleString()} thinking tokens` : "Generated tokens" },
  ];
  const models = Object.entries(usage.byModel);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground" title={`${usage.total.toLocaleString()} tokens in total`}>
        {compact(usage.total)} tokens
      </span>
      {parts.map((p) => (
        <span key={p.label} title={p.hint}>
          {p.label} <span className="text-foreground">{p.value.toLocaleString()}</span>
        </span>
      ))}
      {models.length > 1 && (
        <span title={models.map(([m, u]) => `${m}: ${u.total.toLocaleString()}`).join("\n")}>
          across {models.length} models
        </span>
      )}
    </div>
  );
}
