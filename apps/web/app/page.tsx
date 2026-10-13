import { connection } from "next/server";
import { formatDay, isDateStr, listGenerations, toDateStr } from "@chat-notes/core";
import { DayPicker } from "@/components/date-controls";
import { GenerateButton } from "@/components/generate-button";
import { GenerationPanel } from "@/components/generation-panel";
import { InputSummary } from "@/components/input-summary";
import { PreviousGenerations } from "@/components/previous-generations";

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await connection();
  const { date: q } = await searchParams;
  const date = isDateStr(q) ? q : toDateStr(new Date());
  const gens = listGenerations({ kind: "daily", start: date });
  const [latest, ...older] = gens;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Daily stand-up</h1>
          <p className="text-sm text-muted-foreground">What you&apos;ll say tomorrow about {formatDay(date)}.</p>
        </div>
        <DayPicker date={date} />
      </div>

      <InputSummary start={date} end={date} />

      <div className="flex justify-end">
        <GenerateButton kind="daily" start={date} end={date} label={latest ? "Generate again" : "Generate stand-up"} variant={latest ? "outline" : "default"} />
      </div>

      {latest ? <GenerationPanel g={latest} /> : <p className="text-sm text-muted-foreground">No stand-up generated for this day yet.</p>}
      <PreviousGenerations gens={older} libraryHref={`/library?type=daily&from=${date}&to=${date}`} />
    </div>
  );
}
