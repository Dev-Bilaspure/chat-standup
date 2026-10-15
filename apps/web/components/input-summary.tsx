import Link from "next/link";
import { GitBranch } from "lucide-react";
import { buildStandupInput, codeRepoCount, dayCoverage, listChats } from "@chat-notes/core";
import { ChatChips } from "@/components/chats/chat-chips";
import { CoverageRows } from "@/components/coverage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** What the stand-up will be based on, before generating; flags thin data. */
export function InputSummary({ start, end }: { start: string; end: string }) {
  let stats;
  try {
    stats = buildStandupInput(start, end).stats;
  } catch (err) {
    return (
      <Alert>
        <AlertTitle>Not ready</AlertTitle>
        <AlertDescription>{(err as Error).message}</AlertDescription>
      </Alert>
    );
  }
  const days = dayCoverage(start, end);
  const byId = new Map(listChats().map((c) => [c.id, c]));
  const chats = (stats.conversationIds ?? []).map((id) => byId.get(id)).filter((c) => c !== undefined);
  const thin = stats.mine === 0;
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm">
        Based on <strong>{stats.messages}</strong> messages from <strong>{stats.conversations}</strong> chats, <strong>{stats.mine}</strong> of them yours.
      </p>
      {chats.length > 0 && <ChatChips chats={chats} />}
      <CodeLine />
      <CoverageRows days={days} />
      {thin && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No messages from you were captured for this period. Open the chats you were active in (in Chrome, with capture running) so their history gets captured, then generate.
        </p>
      )}
    </div>
  );
}

/** Whether your commits and PRs will be added (cheap: no git or GitHub calls here). */
function CodeLine() {
  const repos = codeRepoCount();
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <GitBranch className="size-3.5" />
      {repos ? (
        <span>
          Your commits, PRs and reviews from {repos} repo{repos === 1 ? "" : "s"} are added when generating ·{" "}
          <Link href="/data#code" className="underline-offset-2 hover:underline">
            setup
          </Link>
        </span>
      ) : (
        <span>
          Add your repos to include your commits and PRs ·{" "}
          <Link href="/data#code" className="underline-offset-2 hover:underline">
            how
          </Link>
        </span>
      )}
    </p>
  );
}
