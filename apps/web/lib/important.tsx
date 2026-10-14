"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";

// Who's important, shared by every page. Names are display names; a first name
// ("Priya") also counts when no one else in your chats has that first name.

type Important = {
  names: string[];
  people: string[];
  isImportant: (name: string | null | undefined) => boolean;
  /** The full name a first name refers to, or the name itself. */
  resolve: (name: string) => string;
  setImportant: (name: string, important: boolean) => void;
  /** Matches important names in free text; null when nobody is important. */
  pattern: RegExp | null;
};

const ImportantContext = createContext<Important | null>(null);

const first = (name: string) => name.trim().split(/\s+/)[0].toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function ImportantPeopleProvider({ initial, people, children }: { initial: string[]; people: string[]; children: React.ReactNode }) {
  const [names, setNames] = useState(initial);

  // First names shared by more than one person can't identify anyone.
  const ambiguous = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of people) count.set(first(p), (count.get(first(p)) ?? 0) + 1);
    return new Set([...count].filter(([, n]) => n > 1).map(([f]) => f));
  }, [people]);

  const resolve = useCallback(
    (name: string) => {
      const n = name.trim().toLowerCase();
      if (people.some((p) => p.toLowerCase() === n)) return people.find((p) => p.toLowerCase() === n)!;
      if (!n.includes(" ") && !ambiguous.has(n)) return people.find((p) => first(p) === n) ?? name.trim();
      return name.trim();
    },
    [people, ambiguous],
  );

  const aliases = useMemo(() => {
    const out = new Set<string>();
    for (const n of names) {
      out.add(n.toLowerCase());
      if (n.trim().includes(" ") && !ambiguous.has(first(n))) out.add(first(n));
    }
    return out;
  }, [names, ambiguous]);

  const isImportant = useCallback((name: string | null | undefined) => !!name && (aliases.has(name.trim().toLowerCase()) || aliases.has(resolve(name).toLowerCase())), [aliases, resolve]);

  const pattern = useMemo(() => {
    if (!aliases.size) return null;
    const parts = [...aliases].sort((a, b) => b.length - a.length).map(escape);
    return new RegExp(`(?<![\\p{L}\\p{N}])(${parts.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  }, [aliases]);

  const setImportant = useCallback(
    (name: string, important: boolean) => {
      const full = resolve(name);
      const before = names;
      setNames((xs) => (important ? (xs.some((x) => x.toLowerCase() === full.toLowerCase()) ? xs : [...xs, full]) : xs.filter((x) => x.toLowerCase() !== full.toLowerCase())));
      fetch("/api/people/important", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: full, important }) })
        .then(async (res) => {
          if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Failed (${res.status})`);
        })
        .catch((err: Error) => {
          setNames(before);
          toast.error(`Couldn't save: ${err.message}`);
        });
    },
    [names, resolve],
  );

  const value = useMemo(() => ({ names, people, isImportant, resolve, setImportant, pattern }), [names, people, isImportant, resolve, setImportant, pattern]);
  return <ImportantContext.Provider value={value}>{children}</ImportantContext.Provider>;
}

export function useImportant(): Important {
  const ctx = useContext(ImportantContext);
  if (!ctx) throw new Error("useImportant needs ImportantPeopleProvider");
  return ctx;
}
