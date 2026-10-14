"use client";

import { Fragment } from "react";
import { Star } from "lucide-react";
import { useImportant } from "@/lib/important";
import { cn } from "@/lib/utils";

/** Text with important people's names highlighted. */
export function PeopleText({ text }: { text: string }) {
  const { pattern } = useImportant();
  if (!pattern || !text) return <>{text}</>;
  const parts = text.split(pattern);
  // split() with one capture group: odd indexes are the matched names.
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <span key={i} className="font-medium text-amber-700 dark:text-amber-300">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** A person's name; important people get the amber treatment and a star. */
export function PersonName({ name, className }: { name: string; className?: string }) {
  const { isImportant } = useImportant();
  if (!isImportant(name)) return <span className={className}>{name}</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium text-amber-700 dark:text-amber-300", className)}>
      <Star className="size-3 fill-current" aria-label="Important" />
      {name}
    </span>
  );
}

/** Star button that marks someone as important (or not). */
export function StarToggle({ name, className }: { name: string; className?: string }) {
  const { isImportant, setImportant } = useImportant();
  const on = isImportant(name);
  return (
    <button
      type="button"
      onClick={() => setImportant(name, !on)}
      aria-pressed={on}
      aria-label={on ? `Unmark ${name} as important` : `Mark ${name} as important`}
      title={on ? "Important · click to unmark" : "Mark as important"}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted",
        on ? "text-amber-500" : "text-muted-foreground/60 hover:text-foreground",
        className,
      )}
    >
      <Star className={cn("size-4", on && "fill-current")} />
    </button>
  );
}
