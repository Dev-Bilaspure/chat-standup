import { getDb } from "./db";

/** Names of the people you marked as important, in the order you added them. */
export function listImportantPeople(): string[] {
  return (getDb().prepare("SELECT name FROM important_people ORDER BY created_ms").all() as { name: string }[]).map((r) => r.name);
}

export function setImportant(name: string, important: boolean) {
  const n = name.trim().slice(0, 120);
  if (!n) return;
  const db = getDb();
  if (important) db.prepare("INSERT OR IGNORE INTO important_people (name, created_ms) VALUES (?, ?)").run(n, Date.now());
  else db.prepare("DELETE FROM important_people WHERE name = ?").run(n);
}
