import { connection } from "next/server";
import { eachDay, getMessages, getSetting, isDateStr, listTodoRuns, listTodos, scannedDays, toDateStr, type TodoRun } from "@chat-notes/core";
import { FindTodosButton, TodoScope, type View } from "@/components/todos/todo-scope";
import { TodoList } from "@/components/todos/todo-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { compact, dateTime, day, period } from "@/lib/format";

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Range presets, all ending yesterday at the latest (todos are only found for past days). */
function presets(now: Date) {
  const yesterday = addDays(now, -1);
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const lastMonday = addDays(monday, -7);
  const out = [
    { label: "This week", start: toDateStr(monday), end: toDateStr(yesterday) },
    { label: "Last week (Mon–Fri)", start: toDateStr(lastMonday), end: toDateStr(addDays(lastMonday, 4)) },
    { label: "Last 7 days", start: toDateStr(addDays(yesterday, -6)), end: toDateStr(yesterday) },
  ];
  return out.filter((p) => p.start <= p.end);
}

export default async function TodosPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; start?: string; end?: string }> }) {
  await connection();
  const q = await searchParams;
  const now = new Date();
  const today = toDateStr(now);
  const yesterday = toDateStr(addDays(now, -1));
  const p = presets(now);
  // Only past days: anything later is clamped to yesterday.
  const past = (d: string | undefined, fallback: string) => (isDateStr(d) ? (d > yesterday ? yesterday : d) : fallback);

  const view: View = q.view === "day" || q.view === "range" ? q.view : "all";
  const date = past(q.date, yesterday);
  let start = past(q.start, toDateStr(addDays(now, -7)));
  let end = past(q.end, yesterday);
  if (start > end) [start, end] = [end, start];
  const scope = view === "day" ? { from: date, to: date } : view === "range" ? { from: start, to: end } : null;

  const todos = listTodos(scope ?? {});
  const ids = todos.flatMap((t) => (t.doneHintId ? [...t.sourceIds, t.doneHintId] : t.sourceIds));
  const sources = [...getMessages([...new Set(ids)], getSetting("self_id")).entries()];

  // Each day is scanned once; the period is covered when all its days are.
  const days = scope ? eachDay(scope.from, scope.to) : [];
  const scanned = scope ? scannedDays(scope.from, scope.to) : new Map<string, TodoRun>();
  const unscanned = days.filter((d) => !scanned.has(d));
  const runs = [...scanned.values()];
  const failed = scope ? listTodoRuns(scope.from, scope.to).filter((r) => r.error && r.start === r.end && !scanned.has(r.start)) : [];
  const label = scope ? period(scope.from, scope.to) : "";

  const empty = !scope ? (
    <>
      <p className="font-medium text-foreground">No todos yet</p>
      <p className="mt-1">Pick a day or a date range above and find the todos in your chats.</p>
    </>
  ) : !unscanned.length ? (
    <>
      <p className="font-medium text-foreground">No todos for {label}</p>
      <p className="mt-1">{runs.every((r) => r.messages === 0) ? "No messages involving you were captured for this period." : "Nothing in your chats needed you to act."}</p>
    </>
  ) : (
    <>
      <p className="font-medium text-foreground">{unscanned.length === days.length ? "Not scanned yet" : `${unscanned.length} of ${days.length} days not scanned yet`}</p>
      <p className="mt-1">Find todos to read your chats for {unscanned.length === 1 ? day(unscanned[0]) : `${unscanned.length} days`}.</p>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold">Todos</h1>
          <p className="text-sm text-muted-foreground">Things your chats say you need to do: asks, reviews, and what you said you&apos;d do. Found for past days; each day is read once.</p>
        </div>
        <TodoScope view={view} date={date} start={start} end={end} maxDate={yesterday} presets={p} />
      </div>

      {scope && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
          <ScanSummary label={label} days={days.length} runs={runs} />
          <div className="flex items-center gap-2">
            {unscanned.length > 0 && (
              <FindTodosButton days={unscanned} label={unscanned.length === days.length ? "Find todos" : `Find todos for ${unscanned.length} more day${unscanned.length === 1 ? "" : "s"}`} />
            )}
            {view === "day" && !unscanned.length && <FindTodosButton days={[date]} force label="Scan again" variant="ghost" lastTokens={scanned.get(date)?.usage?.total} />}
          </div>
        </div>
      )}

      {failed.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            Couldn&apos;t scan {failed.length === 1 ? day(failed[0].start) : `${new Set(failed.map((f) => f.start)).size} days`}
          </AlertTitle>
          <AlertDescription>
            {failed[0].error} <span className="text-xs">({dateTime(failed[0].createdMs)})</span>. Find todos again to retry.
          </AlertDescription>
        </Alert>
      )}

      <TodoList key={scope ? `${scope.from}:${scope.to}` : "all"} todos={todos} sources={sources} today={today} yesterday={yesterday} empty={empty} />
    </div>
  );
}

function ScanSummary({ label, days, runs }: { label: string; days: number; runs: TodoRun[] }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{label}</span> · not scanned yet</p>;
  const found = runs.reduce((n, r) => n + r.found, 0);
  const tokens = runs.reduce((n, r) => n + (r.usage?.total ?? 0), 0);
  const parts = [
    days === 1 ? `scanned ${dateTime(runs[0].createdMs)}` : `${runs.length} of ${days} days scanned`,
    `${found} todo${found === 1 ? "" : "s"} found`,
    tokens > 0 && `${compact(tokens)} tokens`,
  ].filter(Boolean);
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span> · {parts.join(" · ")}
    </p>
  );
}
