import { getGeneration, saveFeedback, type Usage } from "@chat-notes/core";

const USAGES: Usage[] = ["as_is", "minor_edits", "major_edits", "not_used"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!getGeneration(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const b = (await request.json()) as { rating?: number; usage?: string; missing?: string; wrong?: string; wrongBullets?: string[]; finalText?: string };
  saveFeedback(id, {
    rating: typeof b.rating === "number" && b.rating >= 1 && b.rating <= 5 ? b.rating : null,
    usage: USAGES.includes(b.usage as Usage) ? (b.usage as Usage) : null,
    missing: String(b.missing ?? ""),
    wrong: String(b.wrong ?? ""),
    wrongBullets: Array.isArray(b.wrongBullets) ? b.wrongBullets.map(String) : [],
    finalText: String(b.finalText ?? ""),
  });
  return Response.json({ ok: true });
}
