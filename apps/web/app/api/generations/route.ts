import { purgeGenerations, restoreGenerations, trashGenerations } from "@chat-notes/core";

/** Bulk actions on generations: { action: "trash" | "restore" | "purge", ids: number[] } */
export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; ids?: unknown[] };
  const ids = (body.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return Response.json({ error: "No ids" }, { status: 400 });
  if (body.action === "purge") {
    const count = purgeGenerations(ids);
    if (!count) return Response.json({ error: "Only items in Trash can be deleted permanently" }, { status: 400 });
    return Response.json({ ok: true, count });
  }
  if (body.action === "trash") trashGenerations(ids);
  else if (body.action === "restore") restoreGenerations(ids);
  else return Response.json({ error: "Unknown action" }, { status: 400 });
  return Response.json({ ok: true, count: ids.length });
}
