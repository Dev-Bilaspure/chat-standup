import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Inbox } from "lucide-react";
import {
  SECTIONS,
  generationCounts,
  isDateStr,
  listGenerations,
  queryGenerations,
  standupToText,
  type GenerationSort,
  type GenerationStatus,
  type Kind,
} from "@chat-notes/core";
import { LibraryFilters } from "@/components/library/filters";
import { LibraryList, type LibraryItem } from "@/components/library/list";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;
const STATUSES: GenerationStatus[] = ["all", "needs_feedback", "rated", "failed", "trash"];
const SORTS: GenerationSort[] = ["created", "period", "rating"];

type Search = { q?: string; type?: string; status?: string; from?: string; to?: string; sort?: string; page?: string };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as GenerationStatus) ? (sp.status as GenerationStatus) : "all";
  const kind = sp.type === "daily" || sp.type === "range" ? (sp.type as Kind) : undefined;
  const sort = SORTS.includes(sp.sort as GenerationSort) ? (sp.sort as GenerationSort) : "created";
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total } = queryGenerations({
    status,
    kind,
    sort,
    q: sp.q,
    from: isDateStr(sp.from) ? sp.from : undefined,
    to: isDateStr(sp.to) ? sp.to : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const counts = generationCounts();

  // How many live versions exist per period, to show "3 versions of this period".
  const versions = new Map<string, number>();
  for (const g of listGenerations()) versions.set(`${g.kind}|${g.start}|${g.end}`, (versions.get(`${g.kind}|${g.start}|${g.end}`) ?? 0) + 1);

  const rows: LibraryItem[] = items.map((g) => {
    const bullets = g.output ? SECTIONS.flatMap((s) => g.output![s.key].map((b) => b.text)) : [];
    return {
      id: g.id,
      kind: g.kind,
      start: g.start,
      end: g.end,
      createdMs: g.createdMs,
      model: g.model,
      error: g.error,
      deletedMs: g.deletedMs,
      rating: g.feedback?.rating ?? null,
      usage: g.feedback?.usage ?? null,
      hasFeedback: Boolean(g.feedback),
      bullets: bullets.length,
      preview: bullets.slice(0, 3),
      text: g.output ? standupToText(g.output) : "",
      versions: versions.get(`${g.kind}|${g.start}|${g.end}`) ?? 1,
      tokens: g.usage?.total ?? null,
    };
  });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string" && v) as [string, string][]);
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `/library${next.size ? `?${next}` : ""}`;
  };
  const filtered = Boolean(sp.q || kind || sp.from || sp.to);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Library</h1>
        <p className="text-sm text-muted-foreground">Every stand-up you&apos;ve generated, for any day or range. Deleted items stay in Trash until you remove them.</p>
      </div>

      <Suspense>
        <LibraryFilters counts={counts} />
      </Suspense>

      {rows.length ? (
        <>
          <LibraryList items={rows} inTrash={status === "trash"} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + rows.length} of {total}
            </span>
            {pages > 1 && (
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={pageHref(page - 1)} />}>
                    Previous
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                )}
                {page < pages ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={pageHref(page + 1)} />}>
                    Next
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          {status === "trash" && !filtered ? (
            <p className="text-sm text-muted-foreground">Trash is empty.</p>
          ) : filtered || status !== "all" ? (
            <>
              <p className="text-sm text-muted-foreground">Nothing matches these filters.</p>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/library" />}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No stand-ups yet.</p>
              <Button size="sm" nativeButton={false} render={<Link href="/" />}>
                Generate today&apos;s stand-up
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
