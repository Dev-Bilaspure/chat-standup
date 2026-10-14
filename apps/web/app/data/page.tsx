import { connection } from "next/server";
import { COLLECTOR_PORT, dayCoverage, getDb, getSetting, listChats, toDateStr } from "@chat-notes/core";
import { BlockedChats } from "@/components/chats/blocked-chats";
import { AutoRefresh } from "@/components/auto-refresh";
import { lastCaptureMs } from "@/components/capture-status";
import { CoverageRows } from "@/components/coverage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";


async function collectorHealth(): Promise<{ ok: boolean; startedAt?: number }> {
  try {
    const res = await fetch(`http://127.0.0.1:${COLLECTOR_PORT}/health`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    return (await res.json()) as { ok: boolean; startedAt: number };
  } catch {
    return { ok: false };
  }
}

export default async function DataPage() {
  await connection();
  const health = await collectorHealth();
  const last = lastCaptureMs();
  const db = getDb();
  const selfId = getSetting("self_id");
  const self = selfId ? (db.prepare("SELECT name, email FROM users WHERE id = ?").get(selfId) as { name: string; email: string } | undefined) : undefined;
  const totals = db.prepare("SELECT COUNT(*) AS messages, COUNT(DISTINCT conv_id) AS convs, MIN(created_us) AS first FROM messages").get() as { messages: number; convs: number; first: number | null };
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 20);
  const days = dayCoverage(toDateStr(start), toDateStr(end)).reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Data</h1>
          <p className="text-sm text-muted-foreground">If a stand-up looks wrong, check here first whether the messages were captured at all.</p>
        </div>
        <AutoRefresh />
      </div>

      {!health.ok && (
        <Alert variant="destructive">
          <AlertTitle>Collector not running</AlertTitle>
          <AlertDescription>Nothing is being saved. Start it with `pnpm collector` (or install it as a background service with `pnpm services:install`).</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Collector</div>
          <div className="font-semibold">{health.ok ? "Running" : "Stopped"}</div>
          {health.startedAt && <div className="text-xs text-muted-foreground">since {timeAgo(health.startedAt)}</div>}
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Last capture from Chrome</div>
          <div className="font-semibold">{last ? timeAgo(last) : "never"}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Messages stored</div>
          <div className="font-semibold">{totals.messages.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">in {totals.convs} chats</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">You</div>
          <div className="truncate font-semibold">{self?.name ?? "not detected yet"}</div>
          <div className="truncate text-xs text-muted-foreground">{self?.email ?? "send any message in Chat"}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 3 weeks</CardTitle>
          <CardDescription>
            Messages by the day they were sent. Bars show the hours when the extension was capturing (darker = more of the hour). Messages also arrive from history whenever you open a chat, so a day can have messages without capture that day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CoverageRows days={days} today={toDateStr(new Date())} />
        </CardContent>
      </Card>

      <Card id="blocked">
        <CardHeader>
          <CardTitle>Blocked chats</CardTitle>
          <CardDescription>Spaces, group chats and DMs that aren&apos;t worth recording. Their messages aren&apos;t saved and are never used for stand-ups or todos.</CardDescription>
        </CardHeader>
        <CardContent>
          <BlockedChats chats={listChats()} />
        </CardContent>
      </Card>
    </div>
  );
}
