import { findTodosForDay, isDateStr, toDateStr } from "@chat-notes/core";

/** Finds todos for one past day: { day, force? }. An already scanned day returns its result without scanning again. */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { day?: string; force?: boolean };
  if (!isDateStr(b.day)) return Response.json({ error: "Invalid date" }, { status: 400 });
  if (b.day >= toDateStr(new Date())) return Response.json({ error: "Todos can only be found for past days (up to yesterday)." }, { status: 400 });
  const result = await findTodosForDay(b.day, { force: b.force === true });
  return Response.json(result, { status: result.error ? 500 : 200 });
}
