"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compact, period } from "@/lib/format";
import { cn } from "@/lib/utils";

export type View = "all" | "day" | "range";

function shift(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(y, m - 1, d + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const href = (q: Record<string, string>) => `/todos?${new URLSearchParams(q)}`;

/** Which todos are shown: everything, one day, or a range. Only past days (up to `maxDate`) can be picked. */
export function TodoScope({ view, date, start, end, maxDate, presets }: { view: View; date: string; start: string; end: string; maxDate: string; presets: { label: string; start: string; end: string }[] }) {
  const router = useRouter();
  const go = (q: Record<string, string>) => router.push(href(q));
  const tabs: { value: View; label: string; q: Record<string, string> }[] = [
    { value: "all", label: "All todos", q: {} },
    { value: "day", label: "Day", q: { view: "day", date } },
    { value: "range", label: "Date range", q: { view: "range", start, end } },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg bg-muted p-0.5">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={href(t.q)}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
              view === t.value && "bg-background text-foreground shadow-sm dark:bg-accent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {view === "day" && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" nativeButton={false} render={<Link href={href({ view: "day", date: shift(date, -1) })} aria-label="Previous day" />}>
            <ChevronLeft />
          </Button>
          <Input type="date" value={date} max={maxDate} onChange={(e) => e.target.value && e.target.value <= maxDate && go({ view: "day", date: e.target.value })} className="w-40" />
          <Button variant="outline" size="icon" disabled={date >= maxDate} onClick={() => go({ view: "day", date: shift(date, 1) })} aria-label="Next day">
            <ChevronRight />
          </Button>
        </div>
      )}

      {view === "range" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={start} max={end} onChange={(e) => e.target.value && go({ view: "range", start: e.target.value, end })} className="w-40" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" value={end} min={start} max={maxDate} onChange={(e) => e.target.value && e.target.value <= maxDate && go({ view: "range", start, end: e.target.value })} className="w-40" />
          {presets.map((p) => (
            <Button key={p.label} variant="ghost" size="sm" onClick={() => go({ view: "range", start: p.start, end: p.end })}>
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

type DayResult = { day: string; cached?: boolean; found?: number; added?: number; alreadyDone?: number; emptyReason?: string; error?: string };

/**
 * Scans the given days one request per day (two at a time), so progress is visible and todos show up as
 * each day finishes. Days already scanned are skipped by the server unless `force` is set; a forced
 * re-scan costs a full LLM call per day, so it asks for confirmation first.
 */
export function FindTodosButton({ days, force = false, label, variant = "default", lastTokens }: { days: string[]; force?: boolean; label: string; variant?: "default" | "outline" | "ghost"; lastTokens?: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [startedAt]);

  async function scanDay(day: string): Promise<DayResult> {
    try {
      const res = await fetch("/api/todos/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, force }) });
      const r = (await res.json()) as DayResult;
      return res.ok ? r : { day, error: r.error ?? `Failed (${res.status})` };
    } catch (err) {
      return { day, error: (err as Error).message };
    }
  }

  async function run() {
    setStartedAt(Date.now());
    setElapsed(0);
    setProgress(0);
    const queue = [...days];
    const results: DayResult[] = [];
    const worker = async () => {
      for (let day = queue.shift(); day; day = queue.shift()) {
        results.push(await scanDay(day));
        setProgress(results.length);
        router.refresh();
      }
    };
    await Promise.all([worker(), worker()]);
    setStartedAt(null);

    const failed = results.filter((r) => r.error);
    const added = results.reduce((n, r) => n + (r.added && !r.cached ? r.added : 0), 0);
    const found = results.reduce((n, r) => n + (r.found && !r.cached ? r.found : 0), 0);
    const doneCount = results.reduce((n, r) => n + (r.alreadyDone ?? 0), 0);
    if (failed.length) toast.error(`Couldn't scan ${failed.length} of ${days.length} day${days.length === 1 ? "" : "s"}`, { description: `${failed.map((f) => f.day).join(", ")}: ${failed[0].error}. Try again to retry them.` });
    if (added) toast.success(`Added ${added} todo${added === 1 ? "" : "s"} from ${what}`, { description: doneCount ? `${doneCount} already done according to your chats, so checked.` : undefined });
    else if (found) toast(`No new todos from ${what}`, { description: `The ${found} found ${found === 1 ? "is" : "are"} already on your list.` });
    else if (!failed.length) toast(`No todos for ${what}`, { description: "Nothing in your chats needed you to act." });
    router.refresh();
  }

  const what = days.length === 1 ? period(days[0], days[0]) : `${days.length} days`;
  return (
    <>
      <Button onClick={() => (force ? setConfirming(true) : run())} disabled={startedAt !== null || !days.length} variant={variant}>
        {startedAt ? <Loader2 className="animate-spin" /> : force ? <Search /> : <ListChecks />}
        {startedAt ? (days.length > 1 ? `Reading chats… ${progress} of ${days.length} days · ${elapsed}s` : `Reading chats… ${elapsed}s`) : label}
      </Button>
      {force && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Scan {what} again?</AlertDialogTitle>
              <AlertDialogDescription>
                {days.length === 1 ? "This day was" : "These days were"} already scanned. Scanning again sends the chats to the LLM again
                {lastTokens ? ` (the last scan used ${compact(lastTokens)} tokens)` : ""} and takes up to a minute. Only new todos are added; your
                existing todos, checks, edits and notes stay as they are. It&apos;s only worth it if more of {days.length === 1 ? "this day" : "these days"}{" "}
                was captured since the last scan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirming(false);
                  void run();
                }}
              >
                Scan again
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
