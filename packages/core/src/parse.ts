// Turns captured Google Chat web traffic into messages, users and conversations.
//
// Two formats carry messages:
//  1. Plain JSON API responses (list_topics, create_topic, edit_message, …). A message is an array:
//     [ [[null,null,null,[null, topicId, groupRef]], messageId], [[senderId]], createdUs, updatedUs,
//       null×5, text, … ]
//     groupRef is [null,null,[dmId]] for a 1:1 DM, or [[spaceId]] for spaces and group DMs.
//  2. Live push events: base64 protobuf inside the multi-watch channel. A message event is field
//     8.6.1 with: 1.2 messageId, 1.1.4.2 topicId, 1.1.4.3 groupRef, 2.1.1 senderId,
//     3 createdUs, 4 updatedUs, 10 text.

import { int, path1, pathAll, str } from "./protobuf";

export type CaptureRecord = {
  seq: number;
  t: number;
  frame: string;
  kind: string;
  endpoint: string;
  body: string | null;
  captured?: boolean;
  rid?: string; // XHR id (extension v0.1+), lets us reassemble responses delivered in slices
  final?: boolean; // last slice of that XHR
};

export type Source = "history" | "sent" | "live";
export type ParsedMessage = {
  id: string;
  convId: string;
  convKind: "dm" | "space";
  topicId?: string;
  senderId?: string;
  text: string;
  createdUs: number;
  updatedUs: number;
  source: Source;
};
export type ParsedUser = { id: string; name: string; email?: string };
export type ParsedConversation = { id: string; kind: "dm" | "space"; name?: string };
export type Parsed = { messages: ParsedMessage[]; users: ParsedUser[]; conversations: ParsedConversation[]; selfId?: string };

const isUserId = (s: unknown): s is string => typeof s === "string" && /^\d{15,25}$/.test(s);
const isMicros = (s: unknown): s is string => typeof s === "string" && /^\d{16}$/.test(s);
const isConvId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(s);
const empty = (): Parsed => ({ messages: [], users: [], conversations: [] });

function groupRef(g: unknown): { id: string; kind: "dm" | "space" } | undefined {
  if (!Array.isArray(g)) return undefined;
  if (Array.isArray(g[2]) && isConvId(g[2][0])) return { id: g[2][0], kind: "dm" };
  if (Array.isArray(g[0]) && isConvId(g[0][0])) return { id: g[0][0], kind: "space" };
  return undefined;
}

function walk(node: unknown, visit: (a: unknown[]) => void) {
  if (Array.isArray(node)) {
    visit(node);
    for (const child of node) walk(child, visit);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) walk(v, visit);
  }
}

/** Parses a complete JSON API response body (with or without the )]}' prefix). */
export function parseJsonResponse(body: string, endpoint: string): Parsed | null {
  const text = body.replace(/^\)\]\}'\s*/, "");
  if (!text.startsWith("[") && !text.startsWith("{")) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const out = empty();
  const source: Source = /\/(create_topic|create_message|edit_message)$/.test(endpoint) ? "sent" : "history";

  walk(json, (a) => {
    // Message
    const idPart = a[0];
    if (Array.isArray(idPart) && typeof idPart[1] === "string" && Array.isArray(idPart[0]) && Array.isArray(idPart[0][3])) {
      const topic = idPart[0][3] as unknown[];
      const group = groupRef(topic[2]);
      const sender = Array.isArray(a[1]) && Array.isArray(a[1][0]) ? a[1][0][0] : undefined;
      if (group && isUserId(sender) && isMicros(a[2]) && isMicros(a[3]) && typeof a[9] === "string") {
        out.messages.push({
          id: idPart[1],
          convId: group.id,
          convKind: group.kind,
          topicId: typeof topic[1] === "string" ? topic[1] : undefined,
          senderId: sender,
          text: a[9],
          createdUs: Number(a[2]),
          updatedUs: Number(a[3]),
          source,
        });
        if (source === "sent") out.selfId = sender;
      }
    }
    // Chat user record: [["<id>"], "Name", "<avatar>", "email", "First", "Last", …]
    if (Array.isArray(a[0]) && a[0].length === 1 && isUserId(a[0][0]) && typeof a[1] === "string" && a[1] && typeof a[3] === "string" && a[3].includes("@")) {
      out.users.push({ id: a[0][0], name: a[1], email: a[3] });
    }
    // People API record: [[null,…,"<id>",{…}], "Name", …]
    if (Array.isArray(a[0]) && isUserId(a[0][8]) && typeof a[1] === "string" && a[1] && a[1].length < 80) {
      out.users.push({ id: a[0][8] as string, name: a[1] });
    }
  });

  // Search tokens pair a conversation ID with a readable (lower-cased) name: [3,"pod 06: ujjwal AAQA…"]
  for (const m of body.matchAll(/\[3,"([^"\]]{1,200}?) ([A-Za-z0-9_-]{11})"\]/g)) {
    out.conversations.push({ id: m[2], kind: m[2].startsWith("AAQA") ? "space" : "dm", name: m[1] });
  }
  return out;
}

/** Parses base64 protobuf blobs found in a push-channel text fragment. */
export function parseChannelText(text: string): Parsed {
  const out = empty();
  for (const m of text.replace(/\\u003d/g, "=").matchAll(/"([A-Za-z0-9+/=_-]{40,})"/g)) {
    const buf = Buffer.from(m[1], "base64");
    for (const msg of pathAll(buf, 8, 6, 1)) {
      const idStruct = path1(msg, 1);
      const id = str(idStruct, 2);
      const topic = path1(idStruct, 1, 4);
      const groupBuf = path1(topic, 3);
      const dm = str(path1(groupBuf, 3), 1);
      const space = str(path1(groupBuf, 1), 1);
      const convId = dm ?? space;
      const created = int(msg, 3);
      const text = str(msg, 10);
      if (!id || !convId || created === undefined) continue;
      out.messages.push({
        id,
        convId,
        convKind: dm ? "dm" : "space",
        topicId: str(topic, 2),
        senderId: str(path1(msg, 2, 1), 1),
        text: text ?? "",
        createdUs: Number(created),
        updatedUs: Number(int(msg, 4) ?? created),
        source: "live",
      });
    }
  }
  return out;
}

const CHANNEL = /multi-watch\/channel/;
const JSON_API = /chat\.google\.com\/u\/\d+\/api\/|people-pa\.clients6\.google\.com|DynamiteWebUi\/data\/batchexecute/;

/** Endpoints worth keeping raw: everything that can contain messages, names or conversations. */
export function isUseful(r: CaptureRecord): boolean {
  return r.kind === "frame-loaded" || (r.kind !== "request" && (CHANNEL.test(r.endpoint) || JSON_API.test(r.endpoint)));
}

/**
 * Stateful parser: reassembles responses that arrive in several slices, and keeps a tail of each
 * push-channel stream so blobs split across slices are still found. Feed records in capture order.
 */
export class StreamParser {
  private pending = new Map<string, { text: string; endpoint: string }>();
  private channelTail = new Map<string, string>();

  push(r: CaptureRecord): Parsed | null {
    if (r.final && r.rid && !r.body) this.pending.delete(r.rid);
    if (!r.body || r.kind === "request" || !isUseful(r)) return null;

    if (CHANNEL.test(r.endpoint)) {
      const key = `${r.frame}|${r.endpoint}`;
      const prev = this.channelTail.get(key) ?? "";
      const text = prev + r.body;
      this.channelTail.set(key, text.slice(-60_000));
      return parseChannelText(text);
    }

    // JSON API response, possibly sliced.
    const key = r.rid ?? `${r.frame}|${r.endpoint}`;
    const startsNew = /^\s*(\)\]\}'|\[|\{)/.test(r.body);
    let buf = this.pending.get(key);
    if (!buf || (!r.rid && startsNew)) buf = { text: "", endpoint: r.endpoint };
    buf.text += r.body;
    const parsed = parseJsonResponse(buf.text, buf.endpoint);
    if (parsed || r.final || buf.text.length > 40_000_000) {
      this.pending.delete(key);
      return parsed;
    }
    this.pending.set(key, buf);
    return null;
  }
}
