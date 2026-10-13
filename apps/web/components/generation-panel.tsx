import Link from "next/link";
import { SECTIONS, bulletKey, getMessages, getSetting, standupToText, type Generation } from "@chat-notes/core";
import { CopyButton } from "@/components/copy-button";
import { FeedbackForm } from "@/components/feedback-form";
import { GenerationMenu, TrashBanner } from "@/components/generation-actions";
import { StandupView } from "@/components/standup-view";
import { TokenUsageRow } from "@/components/token-usage";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { dateTime } from "@/lib/format";

export function GenerationPanel({ g, showLink = true }: { g: Generation; showLink?: boolean }) {
  const meta = [dateTime(g.createdMs), g.model, g.durationMs && `${(g.durationMs / 1000).toFixed(0)}s`, g.stats && `${g.stats.messages} msgs from ${g.stats.conversations} chats`, g.promptVersion]
    .filter(Boolean)
    .join(" · ");

  const trashBanner = g.deletedMs ? <TrashBanner id={g.id} /> : null;

  if (g.error || !g.output) {
    return (
      <div className="space-y-4">
        {trashBanner}
        <Alert variant="destructive">
          <AlertTitle>Generation failed</AlertTitle>
          <AlertDescription>
            {g.error}
            <div className="mt-1 text-xs">{meta}</div>
          </AlertDescription>
          {!g.deletedMs && (
            <AlertAction>
              <GenerationMenu id={g.id} kind={g.kind} start={g.start} end={g.end} />
            </AlertAction>
          )}
        </Alert>
      </div>
    );
  }

  const sources = getMessages(Object.values(g.output).flatMap((bs) => bs.flatMap((b) => b.sourceIds)), getSetting("self_id"));
  const text = standupToText(g.output);
  const bullets = SECTIONS.flatMap((s) => g.output![s.key].map((b, i) => ({ key: bulletKey(s.key, i), section: s.title, text: b.text })));

  return (
    <div className="space-y-4">
      {trashBanner}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Stand-up
            {g.feedback?.rating ? <Badge variant="secondary">{"★".repeat(g.feedback.rating)}</Badge> : <Badge variant="outline">not rated yet</Badge>}
          </CardTitle>
          <CardDescription>
            {meta}
            {showLink && (
              <>
                {" · "}
                <Link href={`/g/${g.id}`} className="underline underline-offset-2">
                  #{g.id}
                </Link>
              </>
            )}
          </CardDescription>
          <CardAction className="flex gap-2">
            <CopyButton text={text} />
            {!g.deletedMs && <GenerationMenu id={g.id} kind={g.kind} start={g.start} end={g.end} />}
          </CardAction>
        </CardHeader>
        <CardContent>
          <StandupView output={g.output} sources={sources} />
          {g.stats?.truncated && <p className="mt-4 text-xs text-muted-foreground">Some busy chats were trimmed to your messages and mentions.</p>}
          <div className="mt-5 border-t pt-3">
            <TokenUsageRow usage={g.usage} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your feedback</CardTitle>
          <CardDescription>Takes a minute; this is what tells us after two weeks whether it works.</CardDescription>
        </CardHeader>
        <CardContent>
          <FeedbackForm generationId={g.id} bullets={bullets} generatedText={text} initial={g.feedback} />
        </CardContent>
      </Card>
      <Separator />
    </div>
  );
}
