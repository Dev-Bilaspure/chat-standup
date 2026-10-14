"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import type { Chat } from "@chat-notes/core";
import { ChatBlockDialog, ChatIcon } from "@/components/chats/chat-block-dialog";

/** The chats a stand-up is based on; hover one to block it. */
export function ChatChips({ chats }: { chats: Chat[] }) {
  const [target, setTarget] = useState<Chat | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Chats:</span>
      {chats.map((c) => (
        <span key={c.id} className="group inline-flex items-center gap-1 rounded-md border bg-background py-0.5 pr-0.5 pl-1.5 text-xs text-muted-foreground">
          <ChatIcon kind={c.kind} className="size-3" />
          <span className="max-w-56 truncate">{c.name}</span>
          <button
            type="button"
            onClick={() => setTarget(c)}
            title="Block this chat"
            aria-label={`Block ${c.name}`}
            className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
          >
            <Ban className="size-3" />
          </button>
        </span>
      ))}
      <ChatBlockDialog chat={target} open={target !== null} onOpenChange={(o) => !o && setTarget(null)} />
    </div>
  );
}
