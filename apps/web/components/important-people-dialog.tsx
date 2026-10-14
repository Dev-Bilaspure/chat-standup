"use client";

import { useState } from "react";
import { Star, X } from "lucide-react";
import { PersonPicker } from "@/components/todos/person-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useImportant } from "@/lib/important";

/** Header button: who's important. Add with fuzzy search, remove with one click. */
export function ImportantPeopleDialog() {
  const { names, people, setImportant } = useImportant();
  // Remount the picker after each add so it's empty and ready for the next name.
  const [pickerKey, setPickerKey] = useState(0);
  const candidates = people.filter((p) => !names.some((n) => n.toLowerCase() === p.toLowerCase()));

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Important people" title="Important people" />}>
        <Star className={names.length ? "fill-amber-400 text-amber-500" : ""} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Important people</DialogTitle>
          <DialogDescription>Their names stand out in todos and stand-ups, and you can filter todos by them.</DialogDescription>
        </DialogHeader>

        <PersonPicker
          key={pickerKey}
          people={candidates}
          value={null}
          placeholder="Add someone…"
          className="w-full"
          onChange={(name) => {
            if (!name) return;
            setImportant(name, true);
            setPickerKey((k) => k + 1);
          }}
        />

        {names.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {names.map((n) => (
              <li key={n} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 py-0.5 pr-1 pl-2.5 text-sm text-amber-800 dark:text-amber-200">
                <Star className="size-3 fill-current" />
                {n}
                <button type="button" onClick={() => setImportant(n, false)} aria-label={`Remove ${n}`} className="rounded-full p-0.5 hover:bg-amber-500/20">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody yet. Add your lead, your manager, or anyone whose asks you never want to miss.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
