"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, Loader2, User, Users } from "lucide-react";
import { toast } from "sonner";
import type { Chat, ChatKind } from "@chat-notes/core";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ICON = { space: Hash, group: Users, dm: User } as const;
export const KIND_LABEL: Record<ChatKind, string> = { space: "Space", group: "Group chat", dm: "Direct message" };

export function ChatIcon({ kind, className }: { kind: ChatKind; className?: string }) {
  const Icon = ICON[kind];
  return <Icon className={className ?? "size-3.5 text-muted-foreground"} aria-label={KIND_LABEL[kind]} />;
}

/** Confirms blocking (or unblocking) a chat, with the option to delete (or restore) its recorded messages. */
export function ChatBlockDialog({ chat, open, onOpenChange, onDone }: { chat: Chat | null; open: boolean; onOpenChange: (open: boolean) => void; onDone?: () => void }) {
  const router = useRouter();
  const [alsoMessages, setAlsoMessages] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!chat) return null;
  const blocking = !chat.blockedMs;

  async function confirm() {
    if (!chat) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chats/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blocking ? { convId: chat.id, block: true, deleteMessages: alsoMessages } : { convId: chat.id, block: false, restore: alsoMessages }),
      });
      const data = (await res.json()) as { deleted?: number; restored?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      if (blocking) toast.success(`Blocked ${chat.name}`, { description: data.deleted ? `${data.deleted} recorded messages deleted.` : "New messages won't be recorded." });
      else toast.success(`Unblocked ${chat.name}`, { description: data.restored ? `${data.restored} earlier messages restored from your captures.` : "New messages will be recorded again." });
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setAlsoMessages(true);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChatIcon kind={chat.kind} className="size-4 text-muted-foreground" />
            {blocking ? "Block" : "Unblock"} {chat.name}?
          </DialogTitle>
          <DialogDescription>
            {blocking
              ? "Messages from this chat won't be recorded, and it won't be used for stand-ups or todos. You can unblock it any time."
              : "New messages from this chat will be recorded and used again."}
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox checked={alsoMessages} onCheckedChange={(c) => setAlsoMessages(c === true)} className="mt-0.5" />
          <span>
            {blocking ? (
              <>
                Also delete the {chat.messages ? <strong>{chat.messages}</strong> : ""} message{chat.messages === 1 ? "" : "s"} already recorded
                <span className="block text-xs text-muted-foreground">Stand-ups and todos made from them keep their text, but their source messages will show as missing.</span>
              </>
            ) : (
              <>
                Restore its earlier messages
                <span className="block text-xs text-muted-foreground">From your raw captures on this Mac, including any sent while it was blocked that Chat loaded. Takes a few seconds.</span>
              </>
            )}
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} autoFocus>
            Cancel
          </Button>
          <Button variant={blocking ? "destructive" : "default"} onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {blocking ? "Block chat" : busy && alsoMessages ? "Restoring messages…" : "Unblock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
