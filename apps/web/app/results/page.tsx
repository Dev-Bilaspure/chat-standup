import Link from "next/link";
import { connection } from "next/server";
import { Download, Library } from "lucide-react";
import { evaluate, generationCounts, listGenerations } from "@chat-notes/core";
import { Button } from "@/components/ui/button";
import { compact, num, pct } from "@/lib/format";

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border bg-card p-3">{body}</div>
  );
}

export default async function ResultsPage() {
  await connection();
  const gens = listGenerations();
  const s = evaluate(gens);
  const counts = generationCounts();
  const usable = s.usage.as_is + s.usage.minor_edits;
  const usageTotal = Object.values(s.usage).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Trial results</h1>
          <p className="text-sm text-muted-foreground">
            {s.generations} stand-ups over {s.days} days · feedback on {s.generations - counts.needs_feedback - s.failed}. Items in Trash are excluded.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/standups/library" />}>
            <Library /> Browse in Library
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/export" />}>
            <Download /> Export JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Usable (as-is or minor edits)" value={usageTotal ? pct(usable / usageTotal) : "–"} hint={`${usable} of ${usageTotal} with usage recorded`} />
        <Stat label="Average rating" value={s.avgRating === null ? "–" : `${num(s.avgRating)} / 5`} hint={`${s.rated} rated`} href="/standups/library?status=rated&sort=rating" />
        <Stat label="Bullet precision" value={pct(s.bulletPrecision)} hint={`${s.bulletsWrong} of ${s.bulletsJudged} bullets marked wrong`} />
        <Stat label="Missing items per update" value={num(s.avgMissingItems)} hint={`${s.withMissing} updates missed something`} />
        <Stat label="Similarity to what you sent" value={pct(s.avgSimilarity)} hint="word overlap, draft vs final" />
        <Stat label="Needs feedback" value={String(counts.needs_feedback)} hint="open them to rate" href="/standups/library?status=needs_feedback" />
        <Stat label="Daily · Range" value={`${s.byKind.daily.count} · ${s.byKind.range.count}`} hint={`avg ${num(s.byKind.daily.avgRating)}★ · ${num(s.byKind.range.avgRating)}★`} />
        <Stat label="Failures · avg time" value={`${s.failed} · ${s.avgDurationMs ? `${Math.round(s.avgDurationMs / 1000)}s` : "–"}`} hint={`≈ $${s.totalCostUsd.toFixed(2)} API-equivalent`} href={s.failed ? "/standups/library?status=failed" : undefined} />
        <Stat
          label="Tokens used"
          value={s.tokensRecorded ? compact(s.totalTokens) : "–"}
          hint={s.tokensRecorded ? `avg ${compact(Math.round(s.avgTokens ?? 0))} per stand-up · ${s.tokensRecorded} recorded` : "recorded for new generations"}
        />
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">Reading these numbers</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Usable</strong> is the headline: how often the draft was good enough to send with little or no editing.</li>
          <li><strong>Bullet precision</strong> low means noise or made-up items; <strong>missing items</strong> high means it misses work — check the Data page for capture gaps first.</li>
          <li>Rate each stand-up after you&apos;ve actually used it; unrated ones don&apos;t count.</li>
        </ul>
      </div>
    </div>
  );
}
