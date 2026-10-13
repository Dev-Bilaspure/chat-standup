import Link from "next/link";
import type { Generation } from "@chat-notes/core";
import { dateTime } from "@/lib/format";

/** Older versions for the same period, with a link to see them all in the Library. */
export function PreviousGenerations({ gens, libraryHref }: { gens: Generation[]; libraryHref: string }) {
  if (!gens.length) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Earlier versions ({gens.length})</h2>
        <Link href={libraryHref} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Compare in Library
        </Link>
      </div>
      <ul className="text-sm text-muted-foreground">
        {gens.map((g) => (
          <li key={g.id}>
            <Link href={`/g/${g.id}`} className="underline-offset-2 hover:underline">
              #{g.id} · {dateTime(g.createdMs)} · {g.error ? "failed" : g.feedback?.rating ? `${g.feedback.rating}★` : g.feedback ? "feedback given" : "needs feedback"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
