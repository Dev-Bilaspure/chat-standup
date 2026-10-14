"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { fuzzyRank } from "@/lib/fuzzy";
import { cn } from "@/lib/utils";

// A typed name that isn't in the list is offered as its own item, marked with this prefix.
const NEW = "\u0000new:";
const label = (v: string) => (v.startsWith(NEW) ? v.slice(NEW.length) : v);

/** "From" field: pick someone from your chats with fuzzy search, or type a new name. */
export function PersonPicker({ people, value, onChange, placeholder = "From… like Ujjwal", className }: { people: string[]; value: string | null; onChange: (name: string | null) => void; placeholder?: string; className?: string }) {
  const [query, setQuery] = useState(value ?? "");
  const items = useMemo(() => {
    const q = query.trim();
    // While the input just shows the chosen name, list everyone rather than only that name.
    const ranked = fuzzyRank(people, q === value ? "" : q);
    const known = people.some((p) => p.toLowerCase() === q.toLowerCase());
    return q && !known ? [...ranked, NEW + q] : ranked;
  }, [people, query, value]);

  return (
    <Combobox
      items={items}
      filteredItems={items}
      filter={null}
      value={value}
      onValueChange={(v) => {
        const name = typeof v === "string" ? label(v) : null;
        onChange(name);
        setQuery(name ?? "");
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={(v: string) => label(v)}
      autoHighlight
    >
      <ComboboxInput placeholder={placeholder} showClear={!!value} className={cn("h-8", className)} aria-label="From" />
      <ComboboxContent>
        <ComboboxEmpty>No one found</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {item.startsWith(NEW) ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <UserPlus className="size-3.5" /> Use “<span className="text-foreground">{label(item)}</span>”
                </span>
              ) : (
                item
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
