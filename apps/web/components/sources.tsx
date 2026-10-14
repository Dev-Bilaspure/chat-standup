// Shared by stand-ups and todos. No server-only imports, so client components can use it.
import { ChevronRight, ExternalLink, FileText, GitPullRequest, Link2, Ticket } from "lucide-react";
import type { Reference, SourceMessage } from "@chat-notes/core";
import { PersonName } from "@/components/people";
import { dateTime } from "@/lib/format";

/** Collapsible list of the chat messages something was based on. */
export function SourceMessages({ ids, sources, highlight }: { ids: string[]; sources: Map<string, SourceMessage>; highlight?: string | null }) {
  if (!ids.length) return null;
  return (
    <details className="group/src">
      <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mr-1 inline size-3 transition-transform group-open/src:rotate-90" />
        {ids.length} source message{ids.length === 1 ? "" : "s"}
      </summary>
      <div className="mt-2 space-y-2 border-l pl-3">
        {ids.map((id) => {
          const m = sources.get(id);
          if (!m) return <p key={id} className="text-xs text-muted-foreground">Message {id} not found</p>;
          return (
            <div key={id} className="text-xs">
              <div className="text-muted-foreground">
                {m.convName} · {dateTime(m.createdMs)} · {m.mine ? <span className="font-medium text-foreground">You</span> : <PersonName name={m.senderName} />}
                {highlight === id && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">· shows it was done</span>}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.text.length > 500 ? `${m.text.slice(0, 500)}…` : m.text || "(attachment or card)"}</div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

const REF_ICON = { pr: GitPullRequest, jira: Ticket, doc: FileText, link: Link2 };

export function RefChip({ r }: { r: Reference }) {
  const Icon = REF_ICON[r.kind];
  const body = (
    <>
      <Icon className="size-3.5" />
      <span className="font-mono text-[11px]">{r.label}</span>
      {r.url && <ExternalLink className="size-3 opacity-50" />}
    </>
  );
  const cls = "inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground";
  return r.url ? (
    <a href={r.url} target="_blank" rel="noreferrer" className={`${cls} transition-colors hover:border-primary/40 hover:text-foreground`}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}
