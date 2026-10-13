// Evaluation over the trial period: how useful were the generated stand-ups?
import { standupToText } from "./generate";
import { listGenerations, type Generation, type Usage } from "./store";

/** Word-level similarity (0..1) between the generated text and what was actually sent. */
export function similarity(a: string, b: string): number {
  const x = a.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 1500);
  const y = b.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 1500);
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  let prev = new Uint16Array(y.length + 1);
  let cur = new Uint16Array(y.length + 1);
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  return (2 * prev[y.length]) / (x.length + y.length);
}

export type EvalSummary = {
  generations: number;
  failed: number;
  rated: number;
  avgRating: number | null;
  usage: Record<Usage, number>;
  withMissing: number;
  withWrong: number;
  avgSimilarity: number | null;
  /** Share of bullets not marked wrong, over generations that have feedback. */
  bulletPrecision: number | null;
  bulletsJudged: number;
  bulletsWrong: number;
  /** Average number of missing items listed (one per line) per generation with feedback. */
  avgMissingItems: number | null;
  avgDurationMs: number | null;
  totalCostUsd: number;
  /** Over generations with usage recorded. */
  totalTokens: number;
  avgTokens: number | null;
  tokensRecorded: number;
  byKind: Record<string, { count: number; rated: number; avgRating: number | null }>;
  days: number;
};

export function editSimilarity(g: Generation): number | null {
  if (!g.output || !g.feedback?.finalText.trim()) return null;
  return similarity(standupToText(g.output), g.feedback.finalText);
}

export function evaluate(gens: Generation[] = listGenerations()): EvalSummary {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const ok = gens.filter((g) => !g.error);
  const rated = gens.filter((g) => g.feedback?.rating);
  const usage: Record<Usage, number> = { as_is: 0, minor_edits: 0, major_edits: 0, not_used: 0 };
  for (const g of gens) if (g.feedback?.usage) usage[g.feedback.usage]++;
  const sims = gens.map(editSimilarity).filter((s): s is number => s !== null);
  const byKind: EvalSummary["byKind"] = {};
  for (const kind of ["daily", "range"]) {
    const k = gens.filter((g) => g.kind === kind);
    const kr = k.filter((g) => g.feedback?.rating);
    byKind[kind] = { count: k.length, rated: kr.length, avgRating: avg(kr.map((g) => g.feedback!.rating!)) };
  }
  const judged = gens.filter((g) => g.feedback && g.output);
  const bulletsJudged = judged.reduce((n, g) => n + Object.values(g.output!).flat().length, 0);
  const bulletsWrong = judged.reduce((n, g) => n + g.feedback!.wrongBullets.length, 0);
  return {
    generations: gens.length,
    failed: gens.length - ok.length,
    rated: rated.length,
    avgRating: avg(rated.map((g) => g.feedback!.rating!)),
    usage,
    withMissing: gens.filter((g) => g.feedback?.missing.trim()).length,
    withWrong: gens.filter((g) => g.feedback?.wrong.trim()).length,
    avgSimilarity: avg(sims),
    bulletPrecision: bulletsJudged ? 1 - bulletsWrong / bulletsJudged : null,
    bulletsJudged,
    bulletsWrong,
    avgMissingItems: avg(judged.map((g) => missingItems(g.feedback!.missing))),
    avgDurationMs: avg(ok.map((g) => g.durationMs ?? 0)),
    totalCostUsd: ok.reduce((s, g) => s + (g.costUsd ?? 0), 0),
    totalTokens: gens.reduce((s, g) => s + (g.usage?.total ?? 0), 0),
    avgTokens: avg(gens.filter((g) => g.usage).map((g) => g.usage!.total)),
    tokensRecorded: gens.filter((g) => g.usage).length,
    byKind,
    days: new Set(gens.map((g) => new Date(g.createdMs).toDateString())).size,
  };
}

export const missingItems = (missing: string) => missing.split("\n").filter((l) => l.trim()).length;

/** Stable key for a bullet, used for per-bullet feedback. */
export const bulletKey = (section: string, index: number) => `${section}:${index}`;
