import { connection } from "next/server";
import { formatDay, isDateStr, listGenerations, toDateStr } from "@chat-notes/core";
import { DayPicker, RangePicker } from "@/components/date-controls";
import { GenerateButton } from "@/components/generate-button";
import { GenerationPanel } from "@/components/generation-panel";
import { InputSummary } from "@/components/input-summary";
import { PreviousGenerations } from "@/components/previous-generations";
import { StandupsHeader } from "@/components/standups-header";

function presets() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const lastFriday = new Date(lastMonday);
  lastFriday.setDate(lastMonday.getDate() + 4);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  return [
    { label: "This week", start: toDateStr(monday), end: toDateStr(today) },
    { label: "Last week (Mon–Fri)", start: toDateStr(lastMonday), end: toDateStr(lastFriday) },
    { label: "Last 7 days", start: toDateStr(weekAgo), end: toDateStr(today) },
  ];
}

type Search = { view?: string; date?: string; start?: string; end?: string };

export default async function StandupsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const q = await searchParams;
  const view = q.view === "range" ? "range" : "day";
  const p = presets();
  const date = isDateStr(q.date) ? q.date : toDateStr(new Date());
  const start = isDateStr(q.start) ? q.start : p[0].start;
  const end = isDateStr(q.end) && q.end >= start ? q.end : p[0].end;

  return (
    <div className="space-y-6">
      <StandupsHeader
        active={view}
        date={date}
        start={start}
        end={end}
        subtitle={view === "day" ? `What you'll say tomorrow about ${formatDay(date)}.` : `Update for your lead: ${formatDay(start)} – ${formatDay(end)}.`}
      >
        {view === "day" ? <DayPicker date={date} /> : <RangePicker start={start} end={end} presets={p} />}
      </StandupsHeader>
      {view === "day" ? <DayView date={date} /> : <RangeView start={start} end={end} />}
    </div>
  );
}

function DayView({ date }: { date: string }) {
  const [latest, ...older] = listGenerations({ kind: "daily", start: date });
  return (
    <>
      <InputSummary start={date} end={date} />
      <div className="flex justify-end">
        <GenerateButton kind="daily" start={date} end={date} label={latest ? "Generate again" : "Generate stand-up"} variant={latest ? "outline" : "default"} />
      </div>
      {latest ? <GenerationPanel g={latest} /> : <p className="text-sm text-muted-foreground">No stand-up generated for this day yet.</p>}
      <PreviousGenerations gens={older} libraryHref={`/standups/library?type=daily&from=${date}&to=${date}`} />
    </>
  );
}

function RangeView({ start, end }: { start: string; end: string }) {
  const [latest, ...older] = listGenerations({ kind: "range", start, end });
  return (
    <>
      <InputSummary start={start} end={end} />
      <div className="flex justify-end">
        <GenerateButton kind="range" start={start} end={end} label={latest ? "Generate again" : "Generate update"} variant={latest ? "outline" : "default"} />
      </div>
      {latest ? <GenerationPanel g={latest} /> : <p className="text-sm text-muted-foreground">No update generated for this range yet.</p>}
      <PreviousGenerations gens={older} libraryHref={`/standups/library?type=range&from=${start}&to=${end}`} />
    </>
  );
}
