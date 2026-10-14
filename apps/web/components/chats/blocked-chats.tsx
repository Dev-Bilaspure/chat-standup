"use client";

import { useMemo, useState } from "react";
import { Ban } from "lucide-react";
import type { Chat } from "@chat-notes/core";
import { ChatBlockDialog, ChatIcon, KIND_LABEL } from "@/components/chats/chat-block-dialog";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { timeAgo } from "@/lib/format";
import { fuzzyScore } from "@/lib/fuzzy";

/** Data page: search any chat to block it; blocked chats listed with Unblock. */
export function BlockedChats({ chats }: { chats: Chat[] }) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Chat | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const blocked = chats.filter((c) => c.blockedMs).sort((a, b) => (b.blockedMs ?? 0) - (a.blockedMs ?? 0));
  const byId = useMemo(() => new Map(chats.map((c) => [c.id, c])), [chats]);

  // Most active first; with a query, best fuzzy match first.
  const ids = useMemo(() => {
    const open = chats.filter((c) => !c.blockedMs);
    const q = query.trim();
    if (!q) return open.slice(0, 50).map((c) => c.id);
    return open
      .map((c, i) => ({ c, i, s: fuzzyScore(c.name, q) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => b.s! - a.s! || a.i - b.i)
      .slice(0, 50)
      .map((x) => x.c.id);
  }, [chats, query]);

  return (
    <div className="space-y-4">
      <Combobox
        key={pickerKey}
        items={ids}
        filteredItems={ids}
        filter={null}
        value={null}
        inputValue={query}
        onInputValueChange={setQuery}
        onValueChange={(id) => {
          const chat = typeof id === "string" ? byId.get(id) : undefined;
          if (!chat) return;
          setTarget(chat);
          setQuery("");
          setPickerKey((k) => k + 1);
        }}
        itemToStringLabel={(id: string) => byId.get(id)?.name ?? ""}
        autoHighlight
      >
        <ComboboxInput placeholder="Find a space, group or person to block…" className="w-full" aria-label="Find a chat to block" />
        <ComboboxContent>
          <ComboboxEmpty>No chat found</ComboboxEmpty>
          <ComboboxList>
            {(id: string) => {
              const c = byId.get(id)!;
              return (
                <ComboboxItem key={id} value={id}>
                  <ChatIcon kind={c.kind} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {c.messages} msg{c.messages === 1 ? "" : "s"}
                    {c.lastMs ? ` · ${timeAgo(c.lastMs)}` : ""}
                  </span>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {blocked.length ? (
        <ul className="divide-y rounded-lg border">
          {blocked.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <ChatIcon kind={c.kind} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {KIND_LABEL[c.kind]} · blocked {timeAgo(c.blockedMs!)}
                  {c.messages ? ` · ${c.messages} older messages kept` : ""}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTarget(c)}>
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Ban className="size-4" /> Nothing blocked. Block busy spaces or chats that never matter for your work, like social or announcement groups.
        </p>
      )}

      <ChatBlockDialog chat={target} open={target !== null} onOpenChange={(o) => !o && setTarget(null)} />
    </div>
  );
}
