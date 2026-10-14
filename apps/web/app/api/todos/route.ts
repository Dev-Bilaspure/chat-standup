import { createTodo, isDateStr } from "@chat-notes/core";

/** Adds a todo by hand: { text, sourceDate, askedBy? }. */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { text?: unknown; sourceDate?: unknown; askedBy?: unknown };
  if (typeof b.text !== "string" || !b.text.trim()) return Response.json({ error: "A todo can't be empty" }, { status: 400 });
  if (!isDateStr(b.sourceDate)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const todo = createTodo({ text: b.text, sourceDate: b.sourceDate, askedBy: typeof b.askedBy === "string" ? b.askedBy : null });
  return Response.json({ todo }, { status: 201 });
}
