import { connection } from "next/server";
import { formatDay, isDateStr, listGenerations, toDateStr } from "@chat-notes/core";
import { RangePicker } from "@/components/date-controls";
import { GenerateButton } from "@/components/generate-button";
import { GenerationPanel } from "@/components/generation-panel";
import { InputSummary } from "@/components/input-summary";
import { PreviousGenerations } from "@/components/previous-generations";

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

export default async function RangePage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  await connection();
  const q = await searchParams;
  const p = presets();
  const start = isDateStr(q.start) ? q.start : p[0].start;
  const end = isDateStr(q.end) && q.end >= start ? q.end : p[0].end;
  const [latest, ...older] = listGenerations({ kind: "range", start, end });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold">Update for a date range</h1>
          <p className="text-sm text-muted-foreground">
            For your lead: {formatDay(start)} – {formatDay(end)}.
          </p>
        </div>
        <RangePicker start={start} end={end} presets={p} />
      </div>

      <InputSummary start={start} end={end} />

      <div className="flex justify-end">
        <GenerateButton kind="range" start={start} end={end} label={latest ? "Generate again" : "Generate update"} variant={latest ? "outline" : "default"} />
      </div>

      {latest ? <GenerationPanel g={latest} /> : <p className="text-sm text-muted-foreground">No update generated for this range yet.</p>}
      <PreviousGenerations gens={older} libraryHref={`/library?type=range&from=${start}&to=${end}`} />
    </div>
  );
}
