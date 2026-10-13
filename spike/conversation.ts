// Rebuilds one conversation's timeline from captured traffic.
// Usage: npx tsx spike/conversation.ts [conversationId]   (default: tTxJoSAAAAE)
//
// Sources:
//   history — plain JSON responses (list_topics etc.), loaded when a conversation is opened
//   sent    — create_topic responses (messages you sent from this browser)
//   live    — base64 protobuf events on the push channel, decoded without a schema
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../data/capture");
const convId = process.argv[2] ?? "tTxJoSAAAAE";
type Capture = { seq: number; t: number; kind: string; endpoint: string; body: string | null };
type Msg = { id?: string; time: number; sender?: string; text: string; source: string; path?: string };

const records: Capture[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)))
  .sort((a, b) => a.t - b.t || a.seq - b.seq);

const isUserId = (s: unknown): s is string => typeof s === "string" && /^\d{21}$/.test(s);
const isMicros = (s: unknown): s is string => typeof s === "string" && /^\d{16}$/.test(s);
const names = new Map<string, string>();
const messages = new Map<string, Msg>();
let unparsed = 0;

// ── 1. Plain JSON responses ────────────────────────────────────────────────
function walk(node: unknown, visit: (a: unknown[]) => void) {
  if (!Array.isArray(node)) {
    if (node && typeof node === "object") for (const v of Object.values(node)) walk(v, visit);
    return;
  }
  visit(node);
  for (const child of node) walk(child, visit);
}

for (const r of records) {
  if (!r.body || r.endpoint.includes("multi-watch/channel")) continue;
  const text = r.body.replace(/^\)\]\}'\s*/, "");
  if (!text.startsWith("[") && !text.startsWith("{")) continue;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    unparsed++;
    continue;
  }
  walk(json, (a) => {
    // User record: [["<21-digit id>"], "Display Name", "<avatar>", "email@…", …]
    if (Array.isArray(a[0]) && a[0].length === 1 && isUserId(a[0][0]) && typeof a[1] === "string" && typeof a[3] === "string" && a[3].includes("@")) {
      names.set(a[0][0], a[1]);
    }
    // Message: [<id struct ending in msgId>, <sender: [["id"], …]>, createMicros, updateMicros, ×5, text, …]
    if (
      Array.isArray(a[0]) &&
      typeof a[0][a[0].length - 1] === "string" &&
      Array.isArray(a[1]) &&
      Array.isArray(a[1][0]) &&
      isUserId(a[1][0][0]) &&
      isMicros(a[2]) &&
      typeof a[9] === "string" &&
      JSON.stringify(a[0]).includes(`"${convId}"`)
    ) {
      const id = a[0][a[0].length - 1] as string;
      if (!messages.has(id)) {
        messages.set(id, {
          id,
          time: Number(a[2].slice(0, 13)),
          sender: a[1][0][0],
          text: a[9],
          source: r.endpoint.endsWith("create_topic") ? "sent" : "history",
        });
      }
    }
  });
}

// ── 2. Push channel: base64-encoded protobuf events ───────────────────────
type PbString = { path: string; value: string };

function varint(buf: Buffer, i: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  while (i < buf.length) {
    const b = buf[i++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, i];
    shift += 7n;
    if (shift > 63n) break;
  }
  return [0n, -1];
}

const printable = (s: string) => s.length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f�]/.test(s);

/** Schema-less protobuf decode. Returns every string leaf with its field path, or null if not protobuf. */
function decodePb(buf: Buffer, prefix = "", depth = 0): PbString[] | null {
  const out: PbString[] = [];
  let i = 0;
  while (i < buf.length) {
    const [key, next] = varint(buf, i);
    if (next < 0) return null;
    i = next;
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field === 0) return null;
    const p = prefix ? `${prefix}.${field}` : String(field);
    if (wire === 0) {
      const [, n] = varint(buf, i);
      if (n < 0) return null;
      i = n;
    } else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else if (wire === 2) {
      const [len, n] = varint(buf, i);
      if (n < 0 || n + Number(len) > buf.length) return null;
      const sub = buf.subarray(n, n + Number(len));
      i = n + Number(len);
      const nested = depth < 25 && sub.length > 1 ? decodePb(sub, p, depth + 1) : null;
      const str = sub.toString("utf8");
      const isString = printable(str) && Buffer.from(str, "utf8").equals(sub);
      // Prefer the string reading when the bytes are clean text that contains a space or non-ASCII
      // (human text); otherwise prefer the nested-message reading.
      if (isString && (!nested || /[\s\u0080-￿]/.test(str))) out.push({ path: p, value: str });
      else if (nested) out.push(...nested);
      else if (isString) out.push({ path: p, value: str });
    } else return null;
    if (i > buf.length) return null;
  }
  return out;
}

const looksLikeId = (s: string) =>
  /^[A-Za-z0-9_-]{8,}$/.test(s) || // IDs
  /^[A-Za-z0-9+/=]{20,}$/.test(s) || // sync tokens
  /^\d+$/.test(s) ||
  /^https?:/.test(s) ||
  /dynamite\/chime\//.test(s) || // notification routing paths
  /^[a-z]{2}(-[A-Z]{2})?$/.test(s) || // language codes
  [...names.values()].includes(s); // display names echoed in events
const liveEvents: { time: number; sender?: string; texts: string[]; paths: string[] }[] = [];
const channelText = records.filter((r) => r.endpoint.includes("multi-watch/channel") && r.body).map((r) => r.body).join("").replace(/\\u003d/g, "=");

for (const m of channelText.matchAll(/"([A-Za-z0-9+/=_-]{40,})","(\d{16})"/g)) {
  const strings = decodePb(Buffer.from(m[1], "base64"));
  if (!strings || !strings.some((s) => s.value === convId)) continue;
  const ids = strings.map((s) => s.value).filter(isUserId);
  const human = strings.filter((s) => !looksLikeId(s.value) && s.value !== convId);
  if (!human.length) continue;
  liveEvents.push({ time: Number(m[2].slice(0, 13)), sender: ids[0], texts: human.map((s) => s.value), paths: human.map((s) => s.path) });
}

// Merge live events, skipping ones already known from history/sent (same text within 2 min).
const known = [...messages.values()];
const seenLive = new Set<string>();
for (const e of liveEvents) {
  for (const [i, text] of e.texts.entries()) {
    const dupe = known.some((m) => m.text.trim() === text.trim() && Math.abs(m.time - e.time) < 120_000);
    const key = `${text}|${Math.round(e.time / 60_000)}`;
    if (dupe || seenLive.has(key)) continue;
    seenLive.add(key);
    const msg: Msg = { time: e.time, sender: e.sender, text, source: "live", path: e.paths[i] };
    known.push(msg);
    messages.set(`live:${key}`, msg);
  }
}

// ── Output ────────────────────────────────────────────────────────────────
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const timeline = [...messages.values()].sort((a, b) => a.time - b.time);
const people = [...new Set(timeline.map((m) => m.sender).filter(Boolean))] as string[];

console.log(`Conversation ${convId}: ${timeline.length} messages`);
console.log(`Participants: ${people.map((id) => `${names.get(id) ?? "?"} (${id})`).join(", ") || "unknown"}\n`);
for (const m of timeline) {
  const who = m.sender ? (names.get(m.sender) ?? m.sender) : "?";
  console.log(`${fmtTime(m.time)}  [${m.source.padEnd(7)}] ${who}: ${m.text.replace(/\n+/g, " ⏎ ")}${m.path ? `   ‹${m.path}›` : ""}`);
}
console.log(`\n(${liveEvents.length} push events decoded for this conversation; ${unparsed} non-JSON responses skipped)`);
if (liveEvents.length) {
  console.log("Protobuf field paths carrying text (for building the real parser):");
  const counts = new Map<string, number>();
  for (const e of liveEvents) for (const p of e.paths) counts.set(p, (counts.get(p) ?? 0) + 1);
  for (const [p, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${p}  ×${n}`);
}
