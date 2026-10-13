import { generateStandup, getGeneration, isDateStr } from "@chat-notes/core";

export async function POST(request: Request) {
  const body = (await request.json()) as { kind?: string; start?: string; end?: string };
  const kind = body.kind === "range" ? "range" : "daily";
  const start = body.start;
  const end = kind === "daily" ? body.start : body.end;
  if (!isDateStr(start) || !isDateStr(end) || start > end) {
    return Response.json({ error: "Invalid dates" }, { status: 400 });
  }
  const id = await generateStandup(kind, start, end);
  const g = getGeneration(id);
  return Response.json({ id, error: g?.error ?? null });
}
