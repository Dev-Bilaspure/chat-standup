"use client";

import { toast } from "sonner";

async function post(action: "trash" | "restore" | "purge", ids: number[]) {
  const res = await fetch("/api/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
}

const plural = (n: number) => (n === 1 ? "stand-up" : `${n} stand-ups`);

/** Moves to Trash and offers Undo. `refresh` re-renders server data afterwards. */
export async function trash(ids: number[], refresh: () => void) {
  try {
    await post("trash", ids);
    refresh();
    toast(`Moved ${plural(ids.length)} to Trash`, {
      action: {
        label: "Undo",
        onClick: async () => {
          await post("restore", ids);
          refresh();
        },
      },
    });
  } catch (err) {
    toast.error((err as Error).message);
  }
}

export async function restore(ids: number[], refresh: () => void) {
  try {
    await post("restore", ids);
    refresh();
    toast.success(`Restored ${plural(ids.length)}`);
  } catch (err) {
    toast.error((err as Error).message);
  }
}

export async function purge(ids: number[], refresh: () => void) {
  try {
    await post("purge", ids);
    refresh();
    toast.success(`Permanently deleted ${plural(ids.length)}`);
  } catch (err) {
    toast.error((err as Error).message);
  }
}

/** Generates a new version for the same period; returns the new id. */
export async function regenerate(kind: "daily" | "range", start: string, end: string): Promise<number | null> {
  const id = toast.loading("Generating a new version…");
  try {
    const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, start, end }) });
    const data = (await res.json()) as { id?: number; error?: string | null };
    if (!res.ok || data.error) {
      toast.error(data.error ?? "Generation failed", { id });
      return data.id ?? null;
    }
    toast.success("New version generated", { id });
    return data.id ?? null;
  } catch (err) {
    toast.error((err as Error).message, { id });
    return null;
  }
}
