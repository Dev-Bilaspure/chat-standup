import { blockChat, unblockChat } from "@chat-notes/core";

/**
 * { convId, block: true, deleteMessages } stops recording a chat (optionally deleting what's recorded);
 * { convId, block: false, restore } records it again (optionally restoring its history from raw captures).
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { convId?: unknown; block?: unknown; deleteMessages?: unknown; restore?: unknown };
  if (typeof b.convId !== "string" || !b.convId || typeof b.block !== "boolean") return Response.json({ error: "Invalid request" }, { status: 400 });
  if (b.block) return Response.json({ deleted: blockChat(b.convId, { deleteMessages: b.deleteMessages === true }) });
  return Response.json({ restored: unblockChat(b.convId, { restore: b.restore === true }) });
}
