"use client";

import { useState } from "react";
import { AlertCircle, Check, ChevronRight, Loader2, MoreHorizontal, NotebookPen, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SourceMessage, Todo } from "@chat-notes/core";
import { PeopleText, PersonName, StarToggle } from "@/components/people";
import { RefChip, SourceMessages } from "@/components/sources";
import { PersonPicker } from "@/components/todos/person-picker";
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
  people: string[];
  /** Just added: briefly highlighted and scrolled into view. */
  fresh?: boolean;
  onDoneChange: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
  onNewPerson: (name: string) => void;
};

export function TodoItem({ todo, sources, people, fresh, onDoneChange, onDelete, onNewPerson }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(todo.text);
  const [note, setNote] = useState(todo.note);
  const [from, setFrom] = useState(todo.askedBy);
  // Bumped to remount the title editor with new text (after "Reset to original").
  const [titleVersion, setTitleVersion] = useState(0);
  const done = todo.doneMs !== null;
  // Your own todos have no generated text to compare against.
  const edited = !todo.manual && text.trim() !== todo.originalText.trim();

  function changeFrom(name: string | null) {
    const before = from;
    setFrom(name);
    if (name && !people.includes(name)) onNewPerson(name);
    patchTodo(todo.id, { askedBy: name }).catch((err: Error) => {
      setFrom(before);
      toast.error(`Couldn't save who it's from: ${err.message}`);
    });
  }

  async function resetText() {
    await patchTodo(todo.id, { resetText: true });
    setText(todo.originalText);
    setTitleVersion((v) => v + 1);
  }

  return (
    <li
      ref={(el) => {
        if (fresh && el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }}
      className={cn("group rounded-lg transition-colors duration-700", open ? "bg-muted/40" : "hover:bg-muted/30", fresh && "bg-primary/10")}
    >
      <div className="flex items-start gap-3 px-2 py-1.5">
        <Checkbox checked={done} onCheckedChange={(c) => onDoneChange(todo.id, c === true)} className="mt-[5px]" aria-label={done ? "Mark as not done" : "Mark as done"} />
        <div className="min-w-0 flex-1">
          <TitleEditor key={titleVersion} id={todo.id} initial={text} done={done} onChange={setText} />
          {!open && note.trim() && (
            <button type="button" onClick={() => setOpen(true)} className="block max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground">
              <NotebookPen className="mr-1 inline size-3" />
              <PeopleText text={note.trim().split("\n")[0]} />
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {todo.manual && (
            <span title="Added by you" aria-label="Added by you" className="text-muted-foreground">
              <PenLine className="size-3.5" />
            </span>
          )}
          {from && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              from <PersonName name={from} />
            </span>
          )}
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
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>From</span>
            <PersonPicker people={people} value={from} onChange={changeFrom} placeholder="Nobody (your own)" className="w-56" />
            {from && <StarToggle name={from} />}
            {todo.manual && <span>· Added by you</span>}
          </div>
          {todo.doneBy === "chat" && done && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">Checked automatically: a later message shows this was done. Uncheck it if that&apos;s wrong.</p>
          )}
          {todo.details.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-foreground/85 marker:text-muted-foreground">
              {todo.details.map((d, i) => (
                <li key={i}>
                  <PeopleText text={d} />
                </li>
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
        placeholder="Notes: what you did, links, next steps… like “Pinged Meghana, waiting on QA”"
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
