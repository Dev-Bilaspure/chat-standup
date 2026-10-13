import { dayCoverage, editSimilarity, evaluate, listGenerations, toDateStr } from "@chat-notes/core";

/** Everything needed to analyse the trial afterwards: generations, feedback, inputs, coverage. */
export async function GET() {
  const generations = listGenerations();
  const first = generations.at(-1)?.start ?? toDateStr(new Date());
  const body = {
    exportedAt: new Date().toISOString(),
    summary: evaluate(generations),
    coverage: dayCoverage(first, toDateStr(new Date())),
    generations: generations.map((g) => ({ ...g, editSimilarity: editSimilarity(g) })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="standup-trial-${toDateStr(new Date())}.json"` },
  });
}
