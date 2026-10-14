import { ChevronRight, ExternalLink, FileText, GitPullRequest, Link2, Ticket } from "lucide-react";
import { SECTIONS, isUpdatesOutput, type Bullet, type Reference, type SourceMessage, type StandupOutput } from "@chat-notes/core";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";

/** v2: flat "Updates" list; each update expands to details, references and source messages. v1: sections. */
export function StandupView({ output, sources }: { output: StandupOutput; sources: Map<string, SourceMessage> }) {
  if (isUpdatesOutput(output)) {
    if (!output.updates.length) return <Empty />;
    return (
      <div>
        <p className="mb-2 text-sm font-semibold">Updates:</p>
        <ul className="space-y-1">
          {output.updates.map((b, i) => (
            <UpdateItem key={i} bullet={b} sources={sources} />
          ))}
        </ul>
      </div>
    );
  }

  const sections = SECTIONS.filter((s) => output[s.key]?.length);
  if (!sections.length) return <Empty />;
  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <section key={s.key}>
          <h3 className="mb-2 text-sm font-semibold">{s.title}</h3>
          <ul className="space-y-1">
            {output[s.key].map((b, i) => (
              <UpdateItem key={i} bullet={b} sources={sources} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">The model found nothing to report for this period.</p>;
}

function UpdateItem({ bullet: b, sources }: { bullet: Bullet; sources: Map<string, SourceMessage> }) {
  const details = b.details ?? [];
  const refs = b.references ?? [];
  return (
    <li className="text-sm">
      <details className="group rounded-lg transition-colors open:bg-muted/40">
        <summary className="flex cursor-pointer list-none items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          <span className="flex-1 leading-relaxed">{b.text}</span>
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
            {refs.filter((r) => r.kind === "pr" || r.kind === "jira").length > 0 && (
              <span className="text-xs text-muted-foreground">{refs.filter((r) => r.kind === "pr" || r.kind === "jira").length} ref</span>
            )}
            {!b.sourceIds.length && <Badge variant="destructive">no source</Badge>}
          </span>
        </summary>

        <div className="space-y-3 pt-1 pr-3 pb-3 pl-8">
          {details.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-foreground/85 marker:text-muted-foreground">
              {details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}

          {refs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {refs.map((r) => (
                <RefChip key={r.url ?? r.label} r={r} />
              ))}
            </div>
          )}

          {b.sourceIds.length > 0 && (
            <details className="group/src">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="mr-1 inline size-3 transition-transform group-open/src:rotate-90" />
                {b.sourceIds.length} source message{b.sourceIds.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 space-y-2 border-l pl-3">
                {b.sourceIds.map((id) => {
                  const m = sources.get(id);
                  if (!m) return <p key={id} className="text-xs text-muted-foreground">Message {id} not found</p>;
                  return (
                    <div key={id} className="text-xs">
                      <div className="text-muted-foreground">
                        {m.convName} · {dateTime(m.createdMs)} · <span className={m.mine ? "font-medium text-foreground" : ""}>{m.mine ? "You" : m.senderName}</span>
                      </div>
                      <div className="whitespace-pre-wrap break-words">{m.text.length > 500 ? `${m.text.slice(0, 500)}…` : m.text || "(attachment or card)"}</div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      </details>
    </li>
  );
}

const REF_ICON = { pr: GitPullRequest, jira: Ticket, doc: FileText, link: Link2 };

function RefChip({ r }: { r: Reference }) {
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
