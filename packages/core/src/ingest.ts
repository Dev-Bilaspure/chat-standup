import { getDb, getSetting, setSetting } from "./db";
import { type CaptureRecord, type Parsed, StreamParser } from "./parse";

/** Parses capture records and upserts the results. One instance per capture stream (collector or reparse). */
export class Ingestor {
  private parser = new StreamParser();
  private db = getDb();
  private stmts = {
    message: this.db.prepare(`
      INSERT INTO messages (id, conv_id, topic_id, sender_id, text, created_us, updated_us, source, first_seen_ms, last_seen_ms)
      VALUES (@id, @convId, @topicId, @senderId, @text, @createdUs, @updatedUs, @source, @seen, @seen)
      ON CONFLICT(id) DO UPDATE SET
        text = CASE WHEN excluded.updated_us >= messages.updated_us THEN excluded.text ELSE messages.text END,
        updated_us = MAX(messages.updated_us, excluded.updated_us),
        sender_id = COALESCE(messages.sender_id, excluded.sender_id),
        topic_id = COALESCE(messages.topic_id, excluded.topic_id),
        last_seen_ms = MAX(messages.last_seen_ms, excluded.last_seen_ms)`),
    user: this.db.prepare(`
      INSERT INTO users (id, name, email, updated_ms) VALUES (@id, @name, @email, @seen)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = COALESCE(excluded.email, users.email), updated_ms = excluded.updated_ms`),
    conversation: this.db.prepare(`
      INSERT INTO conversations (id, kind, name, updated_ms) VALUES (@id, @kind, @name, @seen)
      ON CONFLICT(id) DO UPDATE SET name = COALESCE(excluded.name, conversations.name), updated_ms = excluded.updated_ms`),
    minute: this.db.prepare(`
      INSERT INTO capture_minutes (minute, records) VALUES (?, 1)
      ON CONFLICT(minute) DO UPDATE SET records = records + 1`),
  };
  private selfId = getSetting("self_id");

  /** Returns how many messages the record contained. */
  ingest(r: CaptureRecord): number {
    this.stmts.minute.run(Math.floor(r.t / 60_000));
    const parsed = this.parser.push(r);
    if (!parsed) return 0;
    this.apply(parsed, r.t);
    return parsed.messages.length;
  }

  private apply(p: Parsed, seen: number) {
    this.db.transaction(() => {
      for (const m of p.messages) {
        this.stmts.message.run({ ...m, topicId: m.topicId ?? null, senderId: m.senderId ?? null, seen });
        this.stmts.conversation.run({ id: m.convId, kind: m.convKind, name: null, seen });
      }
      for (const u of p.users) this.stmts.user.run({ id: u.id, name: u.name, email: u.email ?? null, seen });
      for (const c of p.conversations) this.stmts.conversation.run({ id: c.id, kind: c.kind, name: c.name ?? null, seen });
      if (p.selfId && p.selfId !== this.selfId) {
        this.selfId = p.selfId;
        setSetting("self_id", p.selfId);
      }
    })();
  }
}
