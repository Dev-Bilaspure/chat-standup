import { connection } from "next/server";
import { COLLECTOR_PORT, codeSetupStatus, dayCoverage, getDb, getSetting, listChats, storageStats, toDateStr } from "@chat-notes/core";
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

      <CodeCard />

      <StorageCard />

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

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(bytes < 10e6 ? 1 : 0)} MB`);

/** Where the space goes, and that backups and raw cleanup are running. */
function StorageCard() {
  const s = storageStats();
  const lowDisk = s.freeBytes !== null && s.freeBytes < 5e9;
  const items = [
    { label: "Database", value: mb(s.dbBytes), hint: "messages, stand-ups, todos, notes" },
    { label: "Raw captures", value: mb(s.raw.bytes), hint: `${s.raw.days} day${s.raw.days === 1 ? "" : "s"}${s.raw.oldest ? ` since ${s.raw.oldest}` : ""} · today ${mb(s.raw.todayBytes)}` },
    { label: "Backups", value: s.backups.count ? mb(s.backups.bytes) : "none yet", hint: s.backups.latest ? `${s.backups.count}, latest ${s.backups.latest}` : "first one runs within the hour" },
    { label: "Free disk", value: s.freeBytes === null ? "–" : mb(s.freeBytes), hint: lowDisk ? "running low" : "on this Mac" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>
          Raw captures are kept for {s.retentionDays} days (compressed once a day is over) so recent days can be re-parsed after a fix; older ones are deleted
          once every message in them is confirmed to be in the database. The database is backed up daily (last 7 days, plus one a week for 4 weeks) in{" "}
          <code className="text-xs">data/backups</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg border bg-background p-3">
            <div className="text-xs text-muted-foreground">{i.label}</div>
            <div className={i.label === "Free disk" && lowDisk ? "font-semibold text-destructive" : "font-semibold"}>{i.value}</div>
            <div className="truncate text-xs text-muted-foreground">{i.hint}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const EXAMPLE = `{
  "code": {
    "repos": ["~/work/backend", "~/projects"],
    "github": true
  }
}`;

/** Code activity setup: which repos are read, your last commit in each, and GitHub sign-in. */
async function CodeCard() {
  const s = await codeSetupStatus();
  const repos = s.entries.flatMap((e) => e.repos);
  return (
    <Card id="code">
      <CardHeader>
        <CardTitle>Code activity</CardTitle>
        <CardDescription>
          Stand-ups also use your own commits (every branch, pushed or not), PRs and reviews, read from your repos and GitHub at generation time. Only titles, messages
          and short PR descriptions are sent to the model, never code. Set up in <code className="text-xs">{s.configPath.split("/").slice(-1)[0]}</code> at the repo root; changes
          apply on the next generation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {s.error && <p className="text-destructive">{s.error}</p>}
        {!s.configured ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Not set up. Copy <code className="text-xs">chat-notes.config.example.json</code> to <code className="text-xs">chat-notes.config.json</code> and list your repos
              (a repo, or a folder of repos; absolute paths, <code className="text-xs">~</code> works):
            </p>
            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">{EXAMPLE}</pre>
          </div>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {s.entries.map((e) =>
                e.status !== "ok" ? (
                  <li key={e.entry} className="px-3 py-2 text-destructive">
                    {e.entry}: {e.status === "missing" ? "path doesn't exist" : "not a git repo, and no git repos directly inside it"}
                  </li>
                ) : (
                  e.repos.map((r) => (
                    <li key={r.path} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{r.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.path}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        {r.lastCommitMs ? `your last commit ${timeAgo(r.lastCommitMs)}` : r.email ? `no commits by ${r.email}` : "no git email set"}
                      </div>
                    </li>
                  ))
                ),
              )}
            </ul>
            <p className="text-xs text-muted-foreground">
              {repos.length} repo{repos.length === 1 ? "" : "s"} ·{" "}
              {s.github === null
                ? "GitHub off"
                : s.github.length === 0
                  ? "no GitHub remotes found"
                  : s.github.map((g) => (g.login ? `GitHub ${g.host}: signed in as ${g.login}` : `GitHub ${g.host}: ${g.error}`)).join(" · ")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
