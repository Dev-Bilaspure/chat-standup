"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Daily" },
  { href: "/range", label: "Date range" },
  { href: "/library", label: "Library" },
  { href: "/results", label: "Results" },
  { href: "/data", label: "Data" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn("rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground", active && "bg-muted text-foreground")}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
