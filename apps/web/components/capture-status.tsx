import Link from "next/link";
import { getDb } from "@chat-notes/core";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

/** Last time the extension delivered anything. Green under 3 minutes. */
export function lastCaptureMs(): number | null {
  const row = getDb().prepare("SELECT MAX(minute) AS m FROM capture_minutes").get() as { m: number | null };
  return row.m === null ? null : row.m * 60_000;
}

export function CaptureStatus() {
  const last = lastCaptureMs();
  const live = last !== null && Date.now() - last < 3 * 60_000;
  return (
    <Link
      href="/data"
      title={live ? "The Chrome extension is sending Chat data." : "Open chat.google.com in Chrome with the extension enabled, and keep the collector running."}
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <span className={cn("size-2 rounded-full", live ? "bg-emerald-500" : "bg-amber-500")} />
      {live ? "Capturing" : last ? `Last capture ${timeAgo(last)}` : "No captures yet"}
    </Link>
  );
}
