// Lists conversations seen in captured traffic, with IDs you can pass to conversation.ts
// or to __chatNotes.fetchChat() in the Chat tab console.
// Usage: npx tsx spike/chats.ts [filter]
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../data/capture");
const filter = process.argv[2]?.toLowerCase();

const bodies = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)))
  .filter((r) => r.body && r.kind !== "request")
  .map((r) => r.body as string);
const all = bodies.join("\n");

type Chat = { id: string; type: string; label: string; mentions: number };
const chats = new Map<string, Chat>();
const add = (id: string, type: string) => {
  const c = chats.get(id) ?? { id, type, label: "", mentions: 0 };
  c.mentions++;
  chats.set(id, c);
};

// Conversation references as they appear in Chat's JSON: DMs vs. spaces / group DMs.
for (const m of all.matchAll(/\[null,null,\["([A-Za-z0-9_-]{11})"\]\]/g)) add(m[1], "DM");
for (const m of all.matchAll(/\[\["(AAQA[A-Za-z0-9_-]{7})"\]\]/g)) add(m[1], "space/group");

// Search tokens like [3,"priya AbCdEfGhIjK"] pair a conversation with a readable name.
for (const m of all.matchAll(/\[3,"([^"\]]{1,200}?) ([A-Za-z0-9_-]{11})"\]/g)) {
  const c = chats.get(m[2]);
  if (c && !c.label) c.label = m[1];
}
// Group DM names like ...,false,"Priya, Sam"],... next to a GROUP_DM marker, and named spaces.
for (const m of all.matchAll(/\[\["(AAQA[A-Za-z0-9_-]{7})"\]\],"([^"]{1,120})"/g)) {
  const c = chats.get(m[1]);
  if (c && !c.label && !/^\d+$/.test(m[2])) c.label = m[2];
}

const rows = [...chats.values()]
  .filter((c) => !filter || c.label.toLowerCase().includes(filter) || c.id.toLowerCase().includes(filter))
  .sort((a, b) => b.mentions - a.mentions);
console.log(`${rows.length} conversations seen (most referenced first)\n`);
for (const c of rows) console.log(`${c.id.padEnd(12)} ${c.type.padEnd(12)} ${String(c.mentions).padStart(5)}×  ${c.label || "(no name found)"}`);
