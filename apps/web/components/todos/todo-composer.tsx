"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Todo } from "@chat-notes/core";
import { PersonPicker } from "@/components/todos/person-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * "Add a todo…" bar. Enter adds and keeps focus for the next one; Escape clears. Who it's from and the
 * day it belongs to show up once you start typing. Press "n" anywhere on the page to jump here.
 */
export function TodoComposer({ people, defaultDate, maxDate, onAdded }: { people: string[]; defaultDate: string; maxDate: string; onAdded: (todo: Todo) => void }) {
  const [text, setText] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const open = text.length > 0 || from !== null;

  // Follow the page's day when it changes (another day or range picked).
  const [prevDefault, setPrevDefault] = useState(defaultDate);
  if (defaultDate !== prevDefault) {
    setPrevDefault(defaultDate);
    setDate(defaultDate);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "n" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function reset() {
    setText("");
    setFrom(null);
  }

  async function add() {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value, sourceDate: date, askedBy: from }) });
      const data = (await res.json()) as { todo?: Todo; error?: string };
      if (!res.ok || !data.todo) throw new Error(data.error ?? `Couldn't add (${res.status})`);
      onAdded(data.todo);
      reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
      input.current?.focus();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
      className={cn("rounded-lg border bg-card transition-shadow", open && "shadow-sm ring-1 ring-ring/20")}
    >
      <div className="flex items-center gap-2 px-3">
        <Plus className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              reset();
              e.currentTarget.blur();
            }
          }}
          placeholder="Add a todo…"
          aria-label="New todo"
          maxLength={500}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {!open && <kbd className="hidden rounded border px-1.5 text-[10px] text-muted-foreground sm:inline">N</kbd>}
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
          <PersonPicker people={people} value={from} onChange={setFrom} className="w-56" />
          <Input type="date" value={date} max={maxDate} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 w-40" aria-label="Day" />
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!text.trim() || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <CornerDownLeft />} Add
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
