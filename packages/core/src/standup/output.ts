// Stand-up output formats and helpers that work across both.
//   v1 (standup-v1): sections done / in_progress / blocked / next, one-line bullets.
//   v2 (standup-v2): one flat "Updates" list in the user's own style; each update has detail
//                    sub-points and references, for expanding in the UI.
import type { Reference } from "./references";

export type Bullet = {
  text: string;
  /** v2: specifics behind the one-liner (PRs, people, status, what's pending). */
  details?: string[];
  /** v2: PRs / Jira / docs found in the cited messages. */
  references?: Reference[];
  sourceIds: string[];
};

export const SECTIONS = [
  { key: "done", title: "Done" },
  { key: "in_progress", title: "In progress" },
  { key: "blocked", title: "Blocked / waiting on" },
  { key: "next", title: "Next" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

export type LegacyOutput = Record<SectionKey, Bullet[]>;
export type UpdatesOutput = { format: 2; updates: Bullet[] };
export type StandupOutput = LegacyOutput | UpdatesOutput;

export const isUpdatesOutput = (o: StandupOutput): o is UpdatesOutput => (o as UpdatesOutput).format === 2;

/** Every bullet with a stable key (used for per-bullet feedback) and its section title, if any. */
export function outputBullets(o: StandupOutput): { key: string; section: string | null; bullet: Bullet }[] {
  if (isUpdatesOutput(o)) return o.updates.map((bullet, i) => ({ key: `updates:${i}`, section: null, bullet }));
  return SECTIONS.flatMap((s) => (o[s.key] ?? []).map((bullet, i) => ({ key: `${s.key}:${i}`, section: s.title, bullet })));
}

/** Text to paste into Chat. With details: each update followed by its sub-points and references. */
export function standupToText(o: StandupOutput, opts: { details?: boolean } = {}): string {
  if (isUpdatesOutput(o)) {
    const lines = ["Updates:"];
    for (const b of o.updates) {
      lines.push(`- ${b.text}`);
      if (opts.details) {
        for (const d of b.details ?? []) lines.push(`    - ${d}`);
        const refs = (b.references ?? []).filter((r) => r.kind !== "link");
        if (refs.length) lines.push(`    - Refs: ${refs.map((r) => (r.url ? `${r.label} (${r.url})` : r.label)).join(", ")}`);
      }
    }
    return lines.join("\n");
  }
  return SECTIONS.filter((s) => o[s.key]?.length)
    .map((s) => `${s.title}\n${o[s.key].map((b) => `- ${b.text}`).join("\n")}`)
    .join("\n\n");
}
