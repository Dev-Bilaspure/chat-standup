// Chats (spaces, group chats, DMs) and blocking them.
import { getDb, getSetting } from "./db";
import { replayRaw } from "./storage";

export type ChatKind = "space" | "group" | "dm";
export type Chat = { id: string; kind: ChatKind; name: string; messages: number; lastMs: number | null; blockedMs: number | null };

/** All known chats, most recently active first, with readable names (DMs and group chats named by who's in them). */
export function listChats(): Chat[] {
  const db = getDb();
  const self = getSetting("self_id") ?? "";
  const rows = db
    .prepare(`
      SELECT c.id, c.kind, c.name, COUNT(m.id) AS messages, MAX(m.created_us) AS last,
        (SELECT group_concat(name, ', ') FROM (
          SELECT DISTINCT u.name FROM messages m2 JOIN users u ON u.id = m2.sender_id
          WHERE m2.conv_id = c.id AND m2.sender_id != @self AND u.name IS NOT NULL LIMIT 4)) AS others,
        (SELECT COUNT(DISTINCT sender_id) FROM messages m3 WHERE m3.conv_id = c.id AND m3.sender_id != @self) AS people,
        b.created_ms AS blocked_ms, b.name AS blocked_name, b.kind AS blocked_kind
      FROM conversations c
      LEFT JOIN messages m ON m.conv_id = c.id
      LEFT JOIN blocked_conversations b ON b.conv_id = c.id
      GROUP BY c.id`)
    .all({ self }) as { id: string; kind: string; name: string | null; messages: number; last: number | null; others: string | null; people: number; blocked_ms: number | null; blocked_name: string | null; blocked_kind: string | null }[];

  return rows
    .map((r): Chat => {
      const kind: ChatKind = (r.blocked_kind as ChatKind | null) ?? (r.kind === "space" ? "space" : r.people > 1 ? "group" : "dm");
      const name = r.blocked_name ?? (r.kind === "space" && r.name ? r.name : (r.others ?? r.name ?? "Unknown chat"));
      return { id: r.id, kind, name, messages: r.messages, lastMs: r.last ? Math.round(r.last / 1000) : null, blockedMs: r.blocked_ms };
    })
    .filter((c) => c.messages > 0 || c.blockedMs)
    .concat(orphanBlocked(new Set(rows.map((r) => r.id))))
    .sort((a, b) => (b.lastMs ?? 0) - (a.lastMs ?? 0));
}

/** Blocked chats with no conversation record left (e.g. after a reparse), so they can still be unblocked. */
function orphanBlocked(known: Set<string>): Chat[] {
  const rows = getDb().prepare("SELECT conv_id, name, kind, created_ms FROM blocked_conversations").all() as { conv_id: string; name: string | null; kind: string | null; created_ms: number }[];
  return rows
    .filter((r) => !known.has(r.conv_id))
    .map((r) => ({ id: r.conv_id, kind: (r.kind as ChatKind | null) ?? "space", name: r.name ?? "Unknown chat", messages: 0, lastMs: null, blockedMs: r.created_ms }));
}

/** Stops recording a chat. With deleteMessages, also removes what was already recorded. Returns messages deleted. */
export function blockChat(convId: string, opts: { deleteMessages: boolean }): number {
  const db = getDb();
  const chat = listChats().find((c) => c.id === convId);
  return db.transaction(() => {
    db.prepare("INSERT OR REPLACE INTO blocked_conversations (conv_id, name, kind, created_ms) VALUES (?, ?, ?, ?)").run(convId, chat?.name ?? null, chat?.kind ?? null, Date.now());
    return opts.deleteMessages ? db.prepare("DELETE FROM messages WHERE conv_id = ?").run(convId).changes : 0;
  })();
}

/** Records a chat again. With restore, replays the raw captures to bring back its earlier messages. Returns messages restored. */
export function unblockChat(convId: string, opts: { restore: boolean }): number {
  const db = getDb();
  db.prepare("DELETE FROM blocked_conversations WHERE conv_id = ?").run(convId);
  if (!opts.restore) return 0;
  const before = (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conv_id = ?").get(convId) as { n: number }).n;
  replayRaw({ onlyConv: convId });
  return (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conv_id = ?").get(convId) as { n: number }).n - before;
}
