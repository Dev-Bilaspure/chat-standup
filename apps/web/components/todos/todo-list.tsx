"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SourceMessage, Todo } from "@chat-notes/core";
import { TodoComposer } from "@/components/todos/todo-composer";
import { TodoItem } from "@/components/todos/todo-item";
import { day } from "@/lib/format";
import { patchTodo } from "@/lib/todo-api";
import { cn } from "@/lib/utils";

type Filter = "open" | "done" | "all";

function dayLabel(date: string, today: string, yesterday: string) {
  if (date === today) return `Today · ${day(date)}`;
  if (date === yesterday) return `Yesterday · ${day(date)}`;
  return day(date);
}

type Props = {
  todos: Todo[];
  sources: [string, SourceMessage][];
  people: string[];
  today: string;
  yesterday: string;
  empty: React.ReactNode;
  /** Days this view shows (null: all days), and the day new todos default to. */
  scope: { from: string; to: string } | null;
  composeDate: string;
};

/** Todos grouped by the day they came from, with Open / Done / All tabs and a bar to add your own. */
export function TodoList({ todos, sources, people: initialPeople, today, yesterday, empty, scope, composeDate }: Props) {
  const router = useRouter();
  const [people, setPeople] = useState(initialPeople);
  const [freshId, setFreshId] = useState<number | null>(null);
  const [items, setItems] = useState(todos);
  const [prev, setPrev] = useState(todos);
  // New data from the server (after finding todos or navigating): take it. Item editors keep their own text.
  if (todos !== prev) {
    setPrev(todos);
    setItems(todos);
  }
  const [filter, setFilter] = useState<Filter>("open");
  // Todos checked/unchecked in this view stay in place until the tab changes, so nothing jumps away mid-click.
  const [sticky, setSticky] = useState<Set<number>>(new Set());
  const sourceMap = useMemo(() => new Map(sources), [sources]);

  const counts = { open: items.filter((t) => !t.doneMs).length, done: items.filter((t) => t.doneMs).length, all: items.length };
  const visible = items.filter((t) => filter === "all" || sticky.has(t.id) || (filter === "open" ? !t.doneMs : !!t.doneMs));
  const groups = new Map<string, Todo[]>();
  for (const t of visible) groups.set(t.sourceDate, [...(groups.get(t.sourceDate) ?? []), t]);
  const days = [...groups.keys()].sort().reverse();

  useEffect(() => {
    if (freshId === null) return;
    const t = setTimeout(() => setFreshId(null), 1600);
    return () => clearTimeout(t);
  }, [freshId]);

  function added(todo: Todo) {
    if (todo.askedBy && !people.includes(todo.askedBy)) setPeople((p) => [...p, todo.askedBy!]);
    if (scope && (todo.sourceDate < scope.from || todo.sourceDate > scope.to)) {
      toast.success(`Added for ${day(todo.sourceDate)}`, {
        description: "That day isn't in this view.",
        action: { label: "Show", onClick: () => router.push(`/todos?view=day&date=${todo.sourceDate}`) },
      });
      return;
    }
    setItems((xs) => [...xs, todo]);
    setSticky((s) => new Set(s).add(todo.id));
    if (filter === "done") setFilter("open");
    setFreshId(todo.id);
  }

  const composer = <TodoComposer people={people} defaultDate={composeDate} maxDate={today} onAdded={added} />;

  function changeFilter(f: Filter) {
    setFilter(f);
    setSticky(new Set());
  }

  function setDone(id: number, done: boolean) {
    const before = items.find((t) => t.id === id);
    setItems((xs) => xs.map((t) => (t.id === id ? { ...t, doneMs: done ? Date.now() : null, doneBy: done ? "me" : null } : t)));
    setSticky((s) => new Set(s).add(id));
    patchTodo(id, { done }).catch((err: Error) => {
      if (before) setItems((xs) => xs.map((t) => (t.id === id ? before : t)));
      toast.error(`Couldn't update the todo: ${err.message}`);
    });
  }

  function remove(id: number) {
    const index = items.findIndex((t) => t.id === id);
    const removed = items[index];
    if (!removed) return;
    setItems((xs) => xs.filter((t) => t.id !== id));
    patchTodo(id, { deleted: true })
      .then(() =>
        toast("Todo deleted", {
          action: {
            label: "Undo",
            onClick: () =>
              patchTodo(id, { deleted: false })
                .then(() => setItems((xs) => [...xs.slice(0, index), removed, ...xs.slice(index)]))
                .catch((err: Error) => toast.error(`Couldn't restore it: ${err.message}`)),
          },
        }),
      )
      .catch((err: Error) => {
        setItems((xs) => [...xs.slice(0, index), removed, ...xs.slice(index)]);
        toast.error(`Couldn't delete the todo: ${err.message}`);
      });
  }

  if (!items.length)
    return (
      <div className="space-y-4">
        {composer}
        <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{empty}</div>
      </div>
    );

  return (
    <div className="space-y-4">
      {composer}
      <div className="inline-flex rounded-lg bg-muted p-0.5" role="tablist">
        {(["open", "done", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => changeFilter(f)}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm text-muted-foreground capitalize transition-colors hover:text-foreground",
              filter === f && "bg-background text-foreground shadow-sm dark:bg-accent",
            )}
          >
            {f} <span className="tabular-nums opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      {!visible.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {filter === "open" ? `Nothing open here. All ${counts.done} done.` : "Nothing marked done yet."}
        </p>
      ) : (
        days.map((date) => [date, groups.get(date)!] as const).map(([date, list]) => (
          <section key={date}>
            <h3 className="mb-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{dayLabel(date, today, yesterday)}</h3>
            <ul className="space-y-0.5">
              {list.map((t) => (
                <TodoItem
                  key={t.id}
                  todo={t}
                  sources={sourceMap}
                  people={people}
                  fresh={t.id === freshId}
                  onDoneChange={setDone}
                  onDelete={remove}
                  onNewPerson={(name) => setPeople((p) => (p.includes(name) ? p : [...p, name]))}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
