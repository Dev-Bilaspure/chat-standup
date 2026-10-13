// Chooses which messages a stand-up is based on, and renders them as model input.
//
// Included conversations: ones where you posted in the period, where you were @mentioned, and
// 1:1 DMs (directed at you). Busy chats are trimmed to your messages, mentions and their
// neighbours. A few earlier messages per chat are added as context (marked, not to be reported).
import { getDb, getSetting } from "../db";
import { eachDay, rangeBounds, toDateStr } from "../time";

const PER_CONV_CAP = 80;
const NEIGHBOURS = 3;
const CONTEXT_BEFORE = 4;
const CHAR_BUDGET = 200_000;

type Row = { id: string; conv_id: string; sender_id: string | null; text: string; created_us: number; conv_kind: string | null; conv_name: string | null; sender_name: string | null };

export type InputStats = {
  messages: number;
  mine: number;
  conversations: number;
  contextMessages: number;
  messagesInPeriod: number;
  truncated: boolean;
  conversationNames: string[];
};
export type StandupInput = { self: { id: string; name: string }; text: string; refs: Record<string, string>; stats: InputStats };

const SELECT = `
  SELECT m.id, m.conv_id, m.sender_id, m.text, m.created_us, c.kind AS conv_kind, c.name AS conv_name, u.name AS sender_name
  FROM messages m LEFT JOIN conversations c ON c.id = m.conv_id LEFT JOIN users u ON u.id = m.sender_id`;

export function getSelf(): { id: string; name: string } {
  const id = getSetting("self_id");
  if (!id) throw new Error("Your Chat user ID isn't known yet. Send or edit any message in Google Chat (with capture running) so it can be detected.");
  const row = getDb().prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined;
  return { id, name: row?.name ?? "the user" };
}

export function buildStandupInput(start: string, end: string): StandupInput {
  const db = getDb();
  const self = getSelf();
  const [fromMs, toMs] = rangeBounds(start, end);
  const rows = db.prepare(`${SELECT} WHERE m.created_us >= ? AND m.created_us < ? ORDER BY m.created_us`).all(fromMs * 1000, toMs * 1000) as Row[];

  const mentionRe = new RegExp(`@${self.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const isMine = (r: Row) => r.sender_id === self.id;
  const mentionsMe = (r: Row) => mentionRe.test(r.text);

  const byConv = new Map<string, Row[]>();
  for (const r of rows) byConv.set(r.conv_id, [...(byConv.get(r.conv_id) ?? []), r]);

  const involved = [...byConv.entries()].filter(([, msgs]) => msgs.some((m) => isMine(m) || mentionsMe(m) || m.conv_kind === "dm"));

  let truncated = false;
  const chats = involved.map(([convId, msgs]) => {
    let kept = msgs;
    if (msgs.length > PER_CONV_CAP) {
      truncated = true;
      const keep = new Set<number>();
      msgs.forEach((m, i) => {
        if (isMine(m) || mentionsMe(m)) for (let j = i - NEIGHBOURS; j <= i + NEIGHBOURS; j++) keep.add(j);
      });
      kept = msgs.filter((_, i) => keep.has(i));
    }
    const context = (db.prepare(`${SELECT} WHERE m.conv_id = ? AND m.created_us < ? ORDER BY m.created_us DESC LIMIT ?`).all(convId, fromMs * 1000, CONTEXT_BEFORE) as Row[]).reverse();
    return { convId, name: chatName(convId, msgs, self.id), kind: msgs[0].conv_kind ?? "space", messages: kept, context };
  });
  chats.sort((a, b) => a.messages[0].created_us - b.messages[0].created_us);

  const refs: Record<string, string> = {};
  let n = 0;
  const multiDay = start !== end;
  const line = (r: Row, maxLen: number, isContext: boolean) => {
    const ref = `r${++n}`;
    refs[ref] = r.id;
    const d = new Date(r.created_us / 1000);
    const when = (multiDay || isContext ? d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) + " " : "") + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const who = isMine(r) ? "ME" : (r.sender_name ?? "Unknown");
    const text = r.text.trim() ? r.text.replace(/\s+/g, " ").slice(0, maxLen) + (r.text.length > maxLen ? "…" : "") : "(attachment or card, no text)";
    return `[${ref}] ${when} · ${who}: ${text}`;
  };

  const render = (maxLen: number, withContext: boolean) => {
    n = 0;
    for (const k of Object.keys(refs)) delete refs[k];
    return chats
      .map((c) => {
        const head = `## ${c.kind === "dm" ? "Direct message with" : "Chat"}: ${c.name}`;
        const ctx = withContext && c.context.length ? ["(context, before the period — don't report)", ...c.context.map((r) => line(r, 200, true)), "(period starts)"] : [];
        return [head, ...ctx, ...c.messages.map((r) => line(r, maxLen, false))].join("\n");
      })
      .join("\n\n");
  };

  let text = render(600, true);
  if (text.length > CHAR_BUDGET) {
    truncated = true;
    text = render(300, false);
  }
  if (text.length > CHAR_BUDGET) text = text.slice(0, CHAR_BUDGET);

  const kept = chats.flatMap((c) => c.messages);
  return {
    self,
    text,
    refs: { ...refs },
    stats: {
      messages: kept.length,
      mine: kept.filter(isMine).length,
      conversations: chats.length,
      contextMessages: chats.reduce((s, c) => s + c.context.length, 0),
      messagesInPeriod: rows.length,
      truncated,
      conversationNames: chats.map((c) => c.name),
    },
  };
}

function chatName(convId: string, msgs: Row[], selfId: string): string {
  const named = msgs[0].conv_name;
  if (named && msgs[0].conv_kind !== "dm") return named;
  const others = [...new Set(msgs.filter((m) => m.sender_id !== selfId && m.sender_name).map((m) => m.sender_name!))];
  return others.length ? others.join(", ") : (named ?? convId);
}

/** Per-day data coverage: how much was captured, and during which hours. */
export function dayCoverage(start: string, end: string) {
  const db = getDb();
  const selfId = getSetting("self_id");
  return eachDay(start, end).map((day) => {
    const [from, to] = rangeBounds(day, day);
    const minutes = db.prepare("SELECT minute, records FROM capture_minutes WHERE minute >= ? AND minute < ?").all(from / 60_000, to / 60_000) as { minute: number; records: number }[];
    const hours = Array.from({ length: 24 }, () => 0);
    for (const m of minutes) hours[new Date(m.minute * 60_000).getHours()]++;
    const msg = db
      .prepare("SELECT COUNT(*) AS total, SUM(sender_id = ?) AS mine, COUNT(DISTINCT conv_id) AS convs, SUM(source = 'live') AS live FROM messages WHERE created_us >= ? AND created_us < ?")
      .get(selfId ?? "", from * 1000, to * 1000) as { total: number; mine: number | null; convs: number; live: number | null };
    return { day, captureMinutes: minutes.length, hours, messages: msg.total, mine: msg.mine ?? 0, conversations: msg.convs, live: msg.live ?? 0 };
  });
}

export const today = () => toDateStr(new Date());
