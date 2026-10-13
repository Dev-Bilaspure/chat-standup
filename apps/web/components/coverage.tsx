import { formatDay } from "@chat-notes/core";
import { cn } from "@/lib/utils";

type Day = { day: string; captureMinutes: number; hours: number[]; messages: number; mine: number; conversations: number; live: number };

/** 24 cells for one day; darker = more minutes with capture activity in that hour. */
export function HourStrip({ hours }: { hours: number[] }) {
  return (
    <div className="flex gap-px" title="Capture activity by hour (00–23)">
      {hours.map((m, h) => (
        <div
          key={h}
          title={`${String(h).padStart(2, "0")}:00 — ${m} min captured`}
          className={cn("h-4 w-2 rounded-[2px]", m === 0 ? "bg-muted" : m < 20 ? "bg-emerald-500/35" : m < 45 ? "bg-emerald-500/70" : "bg-emerald-500")}
        />
      ))}
    </div>
  );
}

export function CoverageRows({ days }: { days: Day[] }) {
  return (
    <div className="space-y-1.5">
      {days.map((d) => (
        <div key={d.day} className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0 text-muted-foreground">{formatDay(d.day)}</span>
          <HourStrip hours={d.hours} />
          <span className="text-muted-foreground">
            {d.messages} msgs · <span className="text-foreground">{d.mine} yours</span> · {d.conversations} chats
            {d.captureMinutes === 0 && d.messages > 0 ? " · from history only" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
