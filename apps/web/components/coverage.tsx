import { formatDay } from "@chat-notes/core";
import { cn } from "@/lib/utils";

type Day = { day: string; captureMinutes: number; hours: number[]; messages: number; mine: number; conversations: number; live: number };

const shade = (minutes: number) => (minutes === 0 ? "bg-muted" : minutes < 20 ? "bg-emerald-500/35" : minutes < 45 ? "bg-emerald-500/70" : "bg-emerald-500");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** 24 cells for one day; darker = more minutes with capture activity in that hour. */
export function HourStrip({ hours }: { hours: number[] }) {
  return (
    <div className="flex gap-px">
      {hours.map((m, h) => (
        <div key={h} title={`${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59 · ${m} min captured`} className={cn("h-4 w-2 rounded-[2px]", shade(m))} />
      ))}
    </div>
  );
}

/** Hour labels aligned with HourStrip (cells are w-2 + 1px gap). */
function HourScale() {
  return (
    <div className="relative h-4 w-[215px] text-[10px] text-muted-foreground">
      {[0, 6, 12, 18].map((h) => (
        <span key={h} className="absolute" style={{ left: `${h * 9}px` }}>
          {String(h).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

export function CoverageRows({ days, today }: { days: Day[]; today?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-xs">
        <span className="w-24 shrink-0" />
        <HourScale />
        <span className="flex items-center gap-2 text-muted-foreground">
          Captured per hour:
          {[0, 10, 30, 60].map((m) => (
            <span key={m} className="flex items-center gap-1">
              <span className={cn("inline-block h-3 w-2 rounded-[2px]", shade(m))} />
              {m === 0 ? "none" : m === 10 ? "<20m" : m === 30 ? "<45m" : "most"}
            </span>
          ))}
        </span>
      </div>
      {days.map((d) => {
        const empty = d.messages === 0 && d.captureMinutes === 0;
        return (
          <div key={d.day} className={cn("flex items-center gap-3 text-xs", empty && "opacity-50")}>
            <span className={cn("w-24 shrink-0 text-muted-foreground", d.day === today && "font-medium text-foreground")}>
              {d.day === today ? "Today" : formatDay(d.day)}
            </span>
            <HourStrip hours={d.hours} />
            <span className="text-muted-foreground">
              {empty ? (
                "nothing captured"
              ) : (
                <>
                  {plural(d.messages, "msg")} · <span className="text-foreground">{d.mine} yours</span> · {plural(d.conversations, "chat")}
                  {d.captureMinutes === 0 && d.messages > 0 ? " · from history only" : ""}
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
