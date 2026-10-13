"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Library, MoreHorizontal, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { purge, regenerate, restore, trash } from "@/lib/generation-actions";

type Props = { id: number; kind: "daily" | "range"; start: string; end: string };

/** "…" menu for one stand-up: new version, move to Trash. */
export function GenerationMenu({ id, kind, start, end }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={async () => {
            const next = await regenerate(kind, start, end);
            if (next && pathname.startsWith("/g/")) router.push(`/g/${next}`);
            else router.refresh();
          }}
        >
          <RefreshCw /> Generate new version
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`/library?from=${start}&to=${end}&type=${kind}`)}>
          <Library /> All versions in Library
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() =>
            trash([id], () => {
              if (pathname.startsWith("/g/")) router.push(kind === "daily" ? `/?date=${start}` : `/range?start=${start}&end=${end}`);
              router.refresh();
            })
          }
        >
          <Trash2 /> Move to Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shown on a stand-up that's in Trash. */
export function TrashBanner({ id }: { id: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <Trash2 className="size-4 text-destructive" />
      <span className="flex-1">This stand-up is in Trash. It&apos;s excluded from the Daily/Range pages, results and export.</span>
      <Button size="sm" variant="outline" onClick={() => restore([id], () => router.refresh())}>
        <RotateCcw /> Restore
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setConfirm(true)}>
        Delete permanently
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this stand-up permanently?</AlertDialogTitle>
            <AlertDialogDescription>The stand-up and its feedback are removed for good. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => purge([id], () => router.push("/library?status=trash"))}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
