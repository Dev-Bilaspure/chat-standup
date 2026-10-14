"use client";

import { useState } from "react";
import { AlertCircle, Check, ChevronRight, Loader2, MoreHorizontal, NotebookPen, RotateCcw, Trash2 } from "lucide-react";
import type { SourceMessage, Todo } from "@chat-notes/core";
import { RefChip, SourceMessages } from "@/components/sources";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { patchTodo } from "@/lib/todo-api";
import { useAutosave, type SaveStatus } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

type Props = {
  todo: Todo;
  sources: Map<string, SourceMessage>;
  onDoneChange: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
};

export function TodoItem({ todo, sources, onDoneChange, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(todo.text);
  const [note, setNote] = useState(todo.note);
  // Bumped to remount the title editor with new text (after "Reset to original").
  const [titleVersion, setTitleVersion] = useState(0);
  const done = todo.doneMs !== null;
  const edited = text.trim() !== todo.originalText.trim();

  async function resetText() {
    await patchTodo(todo.id, { resetText: true });
    setText(todo.originalText);
    setTitleVersion((v) => v + 1);
  }

  return (
    <li className={cn("group rounded-lg transition-colors", open ? "bg-muted/40" : "hover:bg-muted/30")}>
      <div className="flex items-start gap-3 px-2 py-1.5">
        <Checkbox checked={done} onCheckedChange={(c) => onDoneChange(todo.id, c === true)} className="mt-[5px]" aria-label={done ? "Mark as not done" : "Mark as done"} />
        <div className="min-w-0 flex-1">
          <TitleEditor key={titleVersion} id={todo.id} initial={text} done={done} onChange={setText} />
          {!open && note.trim() && (
            <button type="button" onClick={() => setOpen(true)} className="block max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground">
              <NotebookPen className="mr-1 inline size-3" />
              {note.trim().split("\n")[0]}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {todo.askedBy && <span className="hidden text-xs text-muted-foreground sm:inline">from {todo.askedBy}</span>}
          {edited && <span className="text-xs text-muted-foreground">· edited</span>}
          <Button variant="ghost" size="icon-xs" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Details and notes"} aria-expanded={open}>
            <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="More actions" className="opacity-60 group-hover:opacity-100" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {edited && (
                <DropdownMenuItem onClick={resetText}>
                  <RotateCcw /> Reset to original
                </DropdownMenuItem>
              )}
              {edited && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(todo.id)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {open && (
        <div className="space-y-3 pt-1 pr-3 pb-3 pl-9">
          {todo.doneBy === "chat" && done && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">Checked automatically: a later message shows this was done. Uncheck it if that&apos;s wrong.</p>
          )}
          {todo.details.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-foreground/85 marker:text-muted-foreground">
              {todo.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          {edited && <p className="text-xs text-muted-foreground">Originally: {todo.originalText}</p>}
          {todo.references.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {todo.references.map((r) => (
                <RefChip key={r.url ?? r.label} r={r} />
              ))}
            </div>
          )}
          <SourceMessages ids={todo.sourceIds} sources={sources} highlight={todo.doneHintId} />
          <NotesEditor id={todo.id} initial={note} onChange={setNote} />
        </div>
      )}
    </li>
  );
}

/** The todo's text, edited in place. Enter or clicking away finishes; Escape undoes this edit. Never saved empty. */
function TitleEditor({ id, initial, done, onChange }: { id: number; initial: string; done: boolean; onChange: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const [atFocus, setAtFocus] = useState(initial);
  const [lastGood, setLastGood] = useState(initial);
  const { status, set, flush } = useAutosave(initial, (v, o) => patchTodo(id, { text: v }, o));

  function update(v: string) {
    setValue(v);
    if (v.trim()) {
      setLastGood(v);
      set(v);
      onChange(v);
    }
  }

  return (
    <div className="relative">
      <textarea
        rows={1}
        value={value}
        aria-label="Todo"
        onFocus={() => setAtFocus(value)}
        onChange={(e) => update(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            update(atFocus);
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (!value.trim()) setValue(lastGood);
          void flush();
        }}
        className={cn(
          "field-sizing-content -mx-1 block w-[calc(100%+0.5rem)] resize-none rounded-md bg-transparent px-1 py-0.5 text-sm leading-6 outline-none",
          "focus:bg-background focus:ring-2 focus:ring-ring/40",
          done && "text-muted-foreground line-through decoration-muted-foreground/50",
        )}
      />
      {status === "error" && <SaveStatusText status={status} className="mt-0.5" />}
    </div>
  );
}

/** Free-form notes for one todo, saved while typing. */
function NotesEditor({ id, initial, onChange }: { id: number; initial: string; onChange: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const { status, set, flush } = useAutosave(initial, (v, o) => patchTodo(id, { note: v }, o), { delay: 700, maxWait: 3000 });
  return (
    <div className="space-y-1">
      <Textarea
        value={value}
        placeholder="Notes: what you did, links, next steps…"
        onChange={(e) => {
          setValue(e.target.value);
          set(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={() => void flush()}
        className="min-h-20 bg-background text-sm dark:bg-input/20"
      />
      <SaveStatusText status={status} className="h-4" />
    </div>
  );
}

function SaveStatusText({ status, className }: { status: SaveStatus; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)} aria-live="polite">
      {(status === "pending" || status === "saving") && (
        <>
          <Loader2 className="size-3 animate-spin" /> Saving…
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="size-3" /> Saved
        </>
      )}
      {status === "error" && (
        <span className="flex items-center gap-1 text-destructive">
          <AlertCircle className="size-3" /> Couldn&apos;t save, retrying…
        </span>
      )}
    </p>
  );
}
