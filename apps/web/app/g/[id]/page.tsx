import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { formatDay, getGeneration } from "@chat-notes/core";
import { GenerationPanel } from "@/components/generation-panel";

export default async function GenerationPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const g = getGeneration(Number((await params).id));
  if (!g) notFound();
  const period = g.start === g.end ? formatDay(g.start) : `${formatDay(g.start)} – ${formatDay(g.end)}`;
  const back = g.kind === "daily" ? `/standups?view=day&date=${g.start}` : `/standups?view=range&start=${g.start}&end=${g.end}`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {g.kind === "daily" ? "Daily stand-up" : "Range update"} · {period}
        </h1>
        <Link href={back} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← back to {g.kind === "daily" ? "that day" : "that range"}
        </Link>
      </div>
      <GenerationPanel g={g} showLink={false} />
      {g.inputText && (
        <details className="rounded-lg border p-4 text-sm">
          <summary className="cursor-pointer font-medium">Exact input sent to the model ({g.inputText.length.toLocaleString()} chars)</summary>
          <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap text-xs">{g.inputText}</pre>
        </details>
      )}
    </div>
  );
}
