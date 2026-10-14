import { getDb, getSetting, setSetting } from "./db";
import { type CaptureRecord, type Parsed, StreamParser } from "./parse";

/** Parses capture records and upserts the results. One instance per capture stream (collector or reparse). */
export class Ingestor {
  /** onlyConv: keep just this chat's messages (restoring one chat from raw captures). */
  constructor(private opts: { onlyConv?: string } = {}) {}

  /** Whether the last record held messages only from blocked chats (and nothing else worth keeping). */
  lastOnlyBlocked = false;

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
  // Blocked chats, re-read every few seconds so blocking in the app takes effect without a restart.
  private blocked = new Set<string>();
  private blockedAt = 0;
  private isBlocked(convId: string): boolean {
    if (Date.now() - this.blockedAt > 3000) {
      this.blocked = new Set((this.db.prepare("SELECT conv_id FROM blocked_conversations").all() as { conv_id: string }[]).map((r) => r.conv_id));
      this.blockedAt = Date.now();
    }
    return this.blocked.has(convId);
  }

  /** Returns how many messages the record contained. */
  ingest(r: CaptureRecord): number {
    this.lastOnlyBlocked = false;
    if (!this.opts.onlyConv) this.stmts.minute.run(Math.floor(r.t / 60_000));
    const parsed = this.parser.push(r);
    if (!parsed) return 0;
    const keep = parsed.messages.filter((m) => (this.opts.onlyConv ? m.convId === this.opts.onlyConv : !this.isBlocked(m.convId)));
    this.lastOnlyBlocked = parsed.messages.length > 0 && keep.length === 0 && !parsed.users.length && !parsed.conversations.length && !parsed.selfId;
    this.apply({ ...parsed, messages: keep }, r.t);
    return keep.length;
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
