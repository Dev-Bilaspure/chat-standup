import { updateTodo, type TodoPatch } from "@chat-notes/core";

/** One change to a todo: { text } | { note } | { done } | { deleted } | { resetText: true } | { askedBy }. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: TodoPatch = {};
  if (typeof b.text === "string") {
    if (!b.text.trim()) return Response.json({ error: "A todo can't be empty" }, { status: 400 });
    patch.text = b.text;
  }
  if (typeof b.note === "string") patch.note = b.note;
  if (typeof b.done === "boolean") patch.done = b.done;
  if (typeof b.deleted === "boolean") patch.deleted = b.deleted;
  if (b.resetText === true) patch.resetText = true;
  if (typeof b.askedBy === "string" || b.askedBy === null) patch.askedBy = b.askedBy;

  const todo = updateTodo(id, patch);
  if (!todo) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ todo });
}
