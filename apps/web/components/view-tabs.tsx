import Link from "next/link";
import { cn } from "@/lib/utils";

/** Segmented tabs that switch a page's view via its URL (Stand-ups and Todos). */
export function ViewTabs({ tabs }: { tabs: { label: string; href: string; active: boolean }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
            t.active && "bg-background text-foreground shadow-sm dark:bg-accent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
