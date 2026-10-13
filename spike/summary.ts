// Per-conversation summary of messages recovered from plain-JSON responses (what the page
// loads when you open a chat), newest activity first. Use it to check "did opening my unread
// chats capture what I saw on screen?"
// Usage: npx tsx spike/summary.ts [--since HH:MM] [--preview N]
//   --since   only count messages created after this time today (e.g. when you were away)
//   --preview characters of the newest message to show (default 60, 0 to hide)
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../data/capture");
const args = process.argv.slice(2);
const opt = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const previewLen = Number(opt("--preview") ?? 60);
const sinceArg = opt("--since");
const since = sinceArg ? new Date(`${new Date().toDateString()} ${sinceArg}`).getTime() : 0;

type Capture = { seq: number; t: number; kind: string; endpoint: string; body: string | null };
const records: Capture[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));

const isUserId = (s: unknown): s is string => typeof s === "string" && /^\d{21}$/.test(s);
const isMicros = (s: unknown): s is string => typeof s === "string" && /^\d{16}$/.test(s);
const DM_REF = /\[null,null,\["([A-Za-z0-9_-]{11})"\]\]/;
const SPACE_REF = /\[\["(AAQA[A-Za-z0-9_-]{7})"\]\]/;

function walk(node: unknown, visit: (a: unknown[]) => void) {
  if (!Array.isArray(node)) {
    if (node && typeof node === "object") for (const v of Object.values(node)) walk(v, visit);
    return;
  }
  visit(node);
  for (const child of node) walk(child, visit);
}

const names = new Map<string, string>();
const labels = new Map<string, string>();
type Msg = { conv: string; time: number; sender: string; text: string; endpoint: string; capturedAt: number };
const messages = new Map<string, Msg>();
const requests = new Map<string, number>();

for (const r of records) {
  if (r.kind === "request") {
    const ep = r.endpoint.split("/").pop()!;
    requests.set(ep, (requests.get(ep) ?? 0) + 1);
    continue;
  }
  if (!r.body || r.endpoint.includes("multi-watch/channel")) continue;
  for (const m of r.body.matchAll(/\[3,"([^"\]]{1,200}?) ([A-Za-z0-9_-]{11})"\]/g)) if (!labels.has(m[2])) labels.set(m[2], m[1]);
  for (const m of r.body.matchAll(/\[\["(AAQA[A-Za-z0-9_-]{7})"\]\],"([^"]{1,120})"/g)) if (!labels.has(m[1]) && !/^\d+$/.test(m[2])) labels.set(m[1], m[2]);

  const text = r.body.replace(/^\)\]\}'\s*/, "");
  if (!text.startsWith("[") && !text.startsWith("{")) continue;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    continue;
  }
  walk(json, (a) => {
    if (Array.isArray(a[0]) && a[0].length === 1 && isUserId(a[0][0]) && typeof a[1] === "string" && typeof a[3] === "string" && a[3].includes("@")) {
      names.set(a[0][0], a[1]);
    }
    if (Array.isArray(a[0]) && typeof a[0][a[0].length - 1] === "string" && Array.isArray(a[1]) && Array.isArray(a[1][0]) && isUserId(a[1][0][0]) && isMicros(a[2]) && typeof a[9] === "string") {
      const ref = JSON.stringify(a[0]);
      const conv = ref.match(DM_REF)?.[1] ?? ref.match(SPACE_REF)?.[1];
      const id = a[0][a[0].length - 1] as string;
      if (conv && !messages.has(id)) {
        messages.set(id, { conv, time: Number(a[2].slice(0, 13)), sender: a[1][0][0], text: a[9], endpoint: r.endpoint.split("/").pop()!, capturedAt: r.t });
      }
    }
  });
}

const byConv = new Map<string, Msg[]>();
for (const m of messages.values()) if (m.time >= since) byConv.set(m.conv, [...(byConv.get(m.conv) ?? []), m]);

const fmt = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const rows = [...byConv].map(([conv, msgs]) => ({ conv, msgs: msgs.sort((a, b) => a.time - b.time) })).sort((a, b) => b.msgs.at(-1)!.time - a.msgs.at(-1)!.time);

console.log(`Extension v2 request capture: ${requests.size ? [...requests].map(([e, n]) => `${e}×${n}`).join(", ") : "NONE SEEN (old hook still loaded? reload the Chat tab)"}\n`);
console.log(`${rows.length} conversations with recovered messages${since ? ` since ${sinceArg}` : ""} (newest activity first)\n`);
console.log("newest msg      count  conversation                         newest message");
for (const { conv, msgs } of rows) {
  const last = msgs.at(-1)!;
  const label = (labels.get(conv) ?? conv).slice(0, 36).padEnd(36);
  const who = names.get(last.sender) ?? last.sender;
  const preview = previewLen ? `${who}: ${last.text.replace(/\s+/g, " ").slice(0, previewLen)}` : who;
  console.log(`${fmt(last.time)}  ${String(msgs.length).padStart(5)}  ${label} ${preview}`);
}
console.log(`\nTotal: ${messages.size} unique messages recovered from ${[...new Set([...messages.values()].map((m) => m.endpoint))].join(", ")}`);
