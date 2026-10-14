import { listImportantPeople, setImportant } from "@chat-notes/core";

/** Marks or unmarks a person as important: { name, important }. Returns the updated list. */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { name?: unknown; important?: unknown };
  if (typeof b.name !== "string" || !b.name.trim() || typeof b.important !== "boolean") return Response.json({ error: "Invalid request" }, { status: 400 });
  setImportant(b.name, b.important);
  return Response.json({ names: listImportantPeople() });
}
