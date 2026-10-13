"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** Re-renders the page's server data every few seconds while enabled. */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);
  return (
    <button type="button" onClick={() => setOn(!on)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
      <span className={cn("size-2 rounded-full", on ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/40")} />
      {on ? `Live · refreshing every ${seconds}s` : "Paused · click to resume"}
    </button>
  );
}
