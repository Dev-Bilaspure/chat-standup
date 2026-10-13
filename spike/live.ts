// Did live push events carry messages for chats you were NOT viewing?
// Decodes every push-channel event that contains message text (protobuf field 8.6.1.10),
// works out which chat was on screen at that moment, and labels each event VIEWING / BACKGROUND.
// Usage: npx tsx spike/live.ts [--text]     (--text shows the first 40 chars of each message)
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../data/capture");
const showText = process.argv.includes("--text");
type Capture = { seq: number; t: number; frame: string; kind: string; endpoint: string; body: string | null };
const all: Capture[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)))
  .sort((a, b) => a.t - b.t || a.seq - b.seq);
const time = (t: number) => new Date(t).toLocaleTimeString();
const DM_REF = /\[null,null,\["([A-Za-z0-9_-]{11})"\]\]/;
const SPACE_REF = /\[\["(AAQA[A-Za-z0-9_-]{7})"\]\]/;
const convOf = (s: string) => s.match(DM_REF)?.[1] ?? s.match(SPACE_REF)?.[1];

// ── Names and chat labels from plain JSON ──
const names = new Map<string, string>();
const labels = new Map<string, string>();
for (const r of all) {
  if (!r.body || r.kind === "request" || r.endpoint.includes("multi-watch")) continue;
  for (const m of r.body.matchAll(/\[\["(\d{21})"\],"([^"]{1,80})","[^"]*","[^"]*@[^"]*"/g)) names.set(m[1], m[2]);
  for (const m of r.body.matchAll(/\[3,"([^"\]]{1,200}?) ([A-Za-z0-9_-]{11})"\]/g)) if (!labels.has(m[2])) labels.set(m[2], m[1]);
  for (const m of r.body.matchAll(/\[\["(AAQA[A-Za-z0-9_-]{7})"\]\],"([^"]{1,120})"/g)) if (!labels.has(m[1]) && !/^\d+$/.test(m[2])) labels.set(m[1], m[2]);
}
const label = (c?: string) => (c ? (labels.get(c) ?? c) : "?");

// ── What was on screen: page URL + requests/responses the page makes for the chat you open ──
const viewing: { t: number; conv: string; why: string }[] = [];
for (const r of all) {
  if (r.kind === "frame-loaded") {
    const m = r.endpoint.match(/\/(?:chat|room|dm)\/([A-Za-z0-9_-]+)/);
    if (m) viewing.push({ t: r.t, conv: m[1], why: "page load" });
    continue;
  }
  if (!r.body || !/\/api\/(list_topics|mark_group_readstate|mark_topic_readstate|create_topic|edit_message)$/.test(r.endpoint)) continue;
  const conv = convOf(r.body);
  if (conv) viewing.push({ t: r.t, conv, why: r.endpoint.split("/").pop()! });
}
const onScreenAt = (t: number) => {
  let cur: (typeof viewing)[number] | undefined;
  for (const v of viewing) {
    if (v.t > t) break;
    cur = v;
  }
  return cur;
};

// ── Protobuf (schema-less) ──
function varint(buf: Buffer, i: number): [number, number] {
  let result = 0;
  let mul = 1;
  while (i < buf.length) {
    const b = buf[i++];
    result += (b & 0x7f) * mul;
    if (!(b & 0x80)) return [result, i];
    mul *= 128;
    if (mul > 2 ** 56) break;
  }
  return [0, -1];
}
function strings(buf: Buffer, prefix = "", depth = 0): { path: string; value: string }[] | null {
  const out: { path: string; value: string }[] = [];
  let i = 0;
  while (i < buf.length) {
    const [key, n] = varint(buf, i);
    if (n < 0 || key === 0) return null;
    i = n;
    const field = Math.floor(key / 8);
    const wire = key % 8;
    const p = prefix ? `${prefix}.${field}` : String(field);
    if (wire === 0) {
      const [, m] = varint(buf, i);
      if (m < 0) return null;
      i = m;
    } else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else if (wire === 2) {
      const [len, m] = varint(buf, i);
      if (m < 0 || m + len > buf.length) return null;
      const sub = buf.subarray(m, m + len);
      i = m + len;
      const nested = depth < 25 && sub.length > 1 ? strings(sub, p, depth + 1) : null;
      const str = sub.toString("utf8");
      const clean = str.length > 0 && Buffer.from(str, "utf8").equals(sub) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(str);
      if (clean && (!nested || /[\s\u0080-￿]/.test(str))) out.push({ path: p, value: str });
      else if (nested) out.push(...nested);
      else if (clean) out.push({ path: p, value: str });
    } else return null;
    if (i > buf.length) return null;
  }
  return out;
}

// ── Live message events ──
const channel = all.filter((r) => r.endpoint.includes("multi-watch/channel") && r.body);
type Ev = { t: number; conv?: string; sender?: string; text: string };
const events: Ev[] = [];
const seen = new Set<string>();
for (const r of channel) {
  const body = r.body!.replace(/\\u003d/g, "=");
  for (const m of body.matchAll(/"([A-Za-z0-9+/=_-]{40,})","(\d{16})"/g)) {
    const s = strings(Buffer.from(m[1], "base64"));
    const text = s?.find((x) => x.path === "8.6.1.10")?.value;
    if (!s || text === undefined) continue;
    const values = s.map((x) => x.value);
    const tail = body.slice(m.index!, m.index! + m[0].length + 600);
    const conv = tail.match(/\[\["[a-z]+"\],\["([A-Za-z0-9_-]+)"\]/)?.[1] ?? values.find((v) => /^AAQA[A-Za-z0-9_-]{7}$/.test(v) || labels.has(v));
    const sender = values.find((v) => /^\d{21}$/.test(v));
    const key = `${conv}|${text}|${Math.round(r.t / 5000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ t: r.t, conv, sender, text });
  }
}

let background = 0;
let backgroundFromOthers = 0;
console.log(`${events.length} live message events (deduplicated)\n`);
console.log("time         where        chat                               sender");
for (const e of events) {
  const screen = onScreenAt(e.t);
  const where = !screen ? "UNKNOWN" : screen.conv === e.conv ? "viewing" : "BACKGROUND";
  if (where === "BACKGROUND") {
    background++;
    if (e.sender && names.get(e.sender) !== "Dev Bilaspure") backgroundFromOthers++;
  }
  const who = e.sender ? (names.get(e.sender) ?? e.sender) : "?";
  const extra = where === "BACKGROUND" ? `   (on screen: ${label(screen?.conv)})` : "";
  console.log(
    `${time(e.t).padEnd(12)} ${where.padEnd(12)} ${label(e.conv).slice(0, 34).padEnd(34)} ${who}${showText ? `: ${JSON.stringify(e.text.slice(0, 40))}` : ` (${e.text.length} chars)`}${extra}`,
  );
}
console.log(`\n${background} events arrived for a chat that was NOT on screen (${backgroundFromOthers} sent by other people).`);
