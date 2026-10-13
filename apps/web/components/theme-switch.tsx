"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Pill switch with a sliding knob: sun on the left (light), moon on the right (dark). */
export function ThemeSwitch() {
  const { dark, setDark } = useTheme();
  const on = dark === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Dark mode"
      title={on ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setDark(!on)}
      className={cn(
        "relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full border transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        on ? "border-primary/30 bg-primary/15" : "border-border bg-muted",
        dark === null && "opacity-0",
      )}
    >
      {/* Track icons */}
      <Sun className={cn("absolute left-1.5 size-3.5 transition-opacity duration-300", on ? "text-muted-foreground opacity-60" : "opacity-0")} />
      <Moon className={cn("absolute right-1.5 size-3.5 transition-opacity duration-300", on ? "opacity-0" : "text-muted-foreground opacity-60")} />
      {/* Knob */}
      <span
        className={cn(
          "absolute top-0.5 left-0.5 flex size-[1.375rem] items-center justify-center rounded-full shadow-sm transition-all duration-300 ease-out",
          on ? "translate-x-6 bg-primary text-primary-foreground" : "translate-x-0 bg-background text-amber-500",
        )}
      >
        {on ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      </span>
    </button>
  );
}
