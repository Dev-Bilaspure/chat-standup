import { SECTIONS, type SourceMessage, type StandupOutput } from "@chat-notes/core";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";

/** Bullets by section; each bullet expands to the chat messages it was based on. */
export function StandupView({ output, sources }: { output: StandupOutput; sources: Map<string, SourceMessage> }) {
  const sections = SECTIONS.filter((s) => output[s.key]?.length);
  if (!sections.length) return <p className="text-sm text-muted-foreground">The model found nothing to report for this period.</p>;
  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <section key={s.key}>
          <h3 className="mb-2 text-sm font-semibold">{s.title}</h3>
          <ul className="space-y-1.5">
            {output[s.key].map((b, i) => (
              <li key={i} className="text-sm">
                <details className="group">
                  <summary className="flex cursor-pointer list-none gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60">
                    <span className="text-muted-foreground">•</span>
                    <span className="flex-1">{b.text}</span>
                    {b.sourceIds.length ? (
                      <span className="shrink-0 text-xs text-muted-foreground group-open:text-foreground">{b.sourceIds.length} src</span>
                    ) : (
                      <Badge variant="destructive">no source</Badge>
                    )}
                  </summary>
                  <div className="mt-1 mb-2 ml-4 space-y-1.5 border-l pl-3">
                    {b.sourceIds.map((id) => {
                      const m = sources.get(id);
                      if (!m) return <p key={id} className="text-xs text-muted-foreground">Message {id} not found</p>;
                      return (
                        <div key={id} className="text-xs">
                          <div className="text-muted-foreground">
                            {m.convName} · {dateTime(m.createdMs)} · <span className={m.mine ? "font-medium text-foreground" : ""}>{m.mine ? "You" : m.senderName}</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words">{m.text.length > 400 ? `${m.text.slice(0, 400)}…` : m.text || "(attachment or card)"}</div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
