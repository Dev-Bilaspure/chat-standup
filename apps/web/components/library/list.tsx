"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, MoreHorizontal, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { purge, regenerate, restore, trash } from "@/lib/generation-actions";
import { compact, dateTime, period } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LibraryItem = {
  id: number;
  kind: "daily" | "range";
  start: string;
  end: string;
  createdMs: number;
  model: string | null;
  error: string | null;
  deletedMs: number | null;
  rating: number | null;
  usage: string | null;
  hasFeedback: boolean;
  bullets: number;
  preview: string[];
  text: string;
  versions: number;
  /** Total tokens the generation consumed; null if not recorded. */
  tokens: number | null;
};

const USAGE: Record<string, string> = { as_is: "Used as-is", minor_edits: "Minor edits", major_edits: "Major edits", not_used: "Didn't use" };

export function LibraryList({ items, inTrash }: { items: LibraryItem[]; inTrash: boolean }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmPurge, setConfirmPurge] = useState<number[] | null>(null);

  // Drop selections that are no longer on the page (after deletes or filter changes).
  const visible = new Set(items.map((i) => i.id));
  const sel = [...selected].filter((id) => visible.has(id));
  const allChecked = items.length > 0 && sel.length === items.length;

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setSelected(new Set());

  return (
    <div className="space-y-2">
      <div className={cn("flex h-10 items-center gap-3 rounded-lg px-3", sel.length ? "bg-muted" : "")}>
        <Checkbox
          checked={allChecked}
          indeterminate={sel.length > 0 && !allChecked}
          onCheckedChange={() => (allChecked ? clear() : setSelected(new Set(items.map((i) => i.id))))}
          aria-label="Select all on this page"
        />
        {sel.length ? (
          <>
            <span className="text-sm font-medium">{sel.length} selected</span>
            <div className="ml-auto flex gap-2">
              {inTrash ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => restore(sel, refresh).then(clear)}>
                    <RotateCcw /> Restore
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setConfirmPurge(sel)}>
                    <Trash2 /> Delete permanently
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="destructive" onClick={() => trash(sel, refresh).then(clear)}>
                  <Trash2 /> Move to Trash
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={clear}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Select to {inTrash ? "restore or delete permanently" : "delete several at once"}</span>
        )}
      </div>

      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {items.map((g) => (
          <li key={g.id} className={cn("flex gap-3 px-3 py-3 transition-colors hover:bg-muted/40", selected.has(g.id) && "bg-muted/60")}>
            <Checkbox className="mt-1" checked={selected.has(g.id)} onCheckedChange={() => toggle(g.id)} aria-label={`Select #${g.id}`} />
            <Link href={`/g/${g.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{period(g.start, g.end)}</span>
                <Badge variant="outline">{g.kind === "daily" ? "Daily" : "Range"}</Badge>
                {g.error ? (
                  <Badge variant="destructive">Failed</Badge>
                ) : g.rating ? (
                  <span className="text-sm text-amber-500" title={`${g.rating} of 5`}>
                    {"★".repeat(g.rating)}
                    <span className="text-muted-foreground/40">{"★".repeat(5 - g.rating)}</span>
                  </span>
                ) : g.hasFeedback ? (
                  <Badge variant="secondary">Feedback given</Badge>
                ) : (
                  <Badge variant="secondary">Needs feedback</Badge>
                )}
                {g.usage && <span className="text-xs text-muted-foreground">{USAGE[g.usage]}</span>}
                {g.versions > 1 && <span className="text-xs text-muted-foreground">· {g.versions} versions of this period</span>}
              </div>
              {g.error ? (
                <p className="mt-1 line-clamp-1 text-sm text-destructive">{g.error}</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {g.preview.map((p, i) => (
                    <li key={i} className="line-clamp-1">
                      • {p}
                    </li>
                  ))}
                  {g.bullets > g.preview.length && <li className="text-xs">+ {g.bullets - g.preview.length} more</li>}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                #{g.id} · generated {dateTime(g.createdMs)}
                {g.model ? ` · ${g.model}` : ""}
                {g.tokens !== null ? ` · ${compact(g.tokens)} tokens` : ""}
                {g.deletedMs ? ` · deleted ${dateTime(g.deletedMs)}` : ""}
              </p>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.push(`/g/${g.id}`)}>
                  <ExternalLink /> Open
                </DropdownMenuItem>
                {!g.error && (
                  <DropdownMenuItem
                    onClick={async () => {
                      await navigator.clipboard.writeText(g.text);
                      toast.success("Copied to clipboard");
                    }}
                  >
                    <Copy /> Copy text
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={async () => {
                    const id = await regenerate(g.kind, g.start, g.end);
                    if (id) router.push(`/g/${id}`);
                  }}
                >
                  <RefreshCw /> Generate new version
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {inTrash ? (
                  <>
                    <DropdownMenuItem onClick={() => restore([g.id], refresh)}>
                      <RotateCcw /> Restore
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setConfirmPurge([g.id])}>
                      <Trash2 /> Delete permanently
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem variant="destructive" onClick={() => trash([g.id], refresh)}>
                    <Trash2 /> Move to Trash
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      <AlertDialog open={confirmPurge !== null} onOpenChange={(open) => !open && setConfirmPurge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmPurge?.length === 1 ? "this stand-up" : `${confirmPurge?.length} stand-ups`} permanently?</AlertDialogTitle>
            <AlertDialogDescription>The stand-up, its feedback and its evaluation data are removed for good. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const ids = confirmPurge ?? [];
                setConfirmPurge(null);
                await purge(ids, refresh);
                clear();
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
