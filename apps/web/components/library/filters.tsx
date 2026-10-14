"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Counts = { all: number; needs_feedback: number; rated: number; failed: number; trash: number };

const STATUSES: { value: keyof Counts; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_feedback", label: "Needs feedback" },
  { value: "rated", label: "Rated" },
  { value: "failed", label: "Failed" },
  { value: "trash", label: "Trash" },
];
const TYPES = [
  { value: "", label: "All types" },
  { value: "daily", label: "Daily" },
  { value: "range", label: "Range" },
];
const SORTS = [
  { value: "created", label: "Newest generated" },
  { value: "period", label: "Latest period" },
  { value: "rating", label: "Highest rated" },
];

function Segmented({ options, value, onChange }: { options: { value: string; label: React.ReactNode }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
            value === o.value && "bg-background text-foreground shadow-sm dark:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LibraryFilters({ counts }: { counts: Counts }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  // Debounced search.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => set({ q: q.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const status = params.get("status") ?? "all";
  const type = params.get("type") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const sort = params.get("sort") ?? "created";
  const active = Boolean(params.get("q") || type || from || to || status !== "all" || sort !== "created");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bullets, PR numbers, people like Dev, dates…" className="pl-8" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <ArrowDownUp />
            {SORTS.find((s) => s.value === sort)?.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORTS.map((s) => (
              <DropdownMenuItem key={s.value} onClick={() => set({ sort: s.value === "created" ? "" : s.value })}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={status}
          onChange={(v) => set({ status: v === "all" ? "" : v })}
          options={STATUSES.map((s) => ({
            value: s.value,
            label: (
              <>
                {s.label} <span className="text-xs opacity-60">{counts[s.value]}</span>
              </>
            ),
          }))}
        />
        <Segmented value={type} onChange={(v) => set({ type: v })} options={TYPES} />
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Period</span>
          <Input type="date" value={from} onChange={(e) => set({ from: e.target.value })} className="h-8 w-36" aria-label="Period from" />
          <span>–</span>
          <Input type="date" value={to} onChange={(e) => set({ to: e.target.value })} className="h-8 w-36" aria-label="Period to" />
        </div>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              router.replace(pathname, { scroll: false });
            }}
          >
            <X /> Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
