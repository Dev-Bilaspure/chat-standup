"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function shift(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(y, m - 1, d + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function DayPicker({ date }: { date: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={`/standups?view=day&date=${shift(date, -1)}`} aria-label="Previous day" />}>
        <ChevronLeft />
      </Button>
      <Input type="date" value={date} onChange={(e) => e.target.value && router.push(`/standups?view=day&date=${e.target.value}`)} className="w-40" />
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={`/standups?view=day&date=${shift(date, 1)}`} aria-label="Next day" />}>
        <ChevronRight />
      </Button>
    </div>
  );
}

export function RangePicker({ start, end, presets }: { start: string; end: string; presets: { label: string; start: string; end: string }[] }) {
  const router = useRouter();
  const go = (s: string, e: string) => router.push(`/standups?view=range&start=${s}&end=${e}`);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" value={start} onChange={(e) => e.target.value && go(e.target.value, end < e.target.value ? e.target.value : end)} className="w-40" />
      <span className="text-sm text-muted-foreground">to</span>
      <Input type="date" value={end} onChange={(e) => e.target.value && go(start > e.target.value ? e.target.value : start, e.target.value)} className="w-40" />
      {presets.map((p) => (
        <Button key={p.label} variant="ghost" size="sm" onClick={() => go(p.start, p.end)}>
          {p.label}
        </Button>
      ))}
    </div>
  );
}
