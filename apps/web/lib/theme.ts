"use client";

import { useEffect, useState } from "react";

// Theme = "dark" class on <html>. The choice is stored in localStorage; with no stored choice,
// the page follows the macOS appearance. THEME_SCRIPT runs in <head> before first paint (no flash).
const KEY = "theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;

function apply(dark: boolean) {
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
}

/** Current theme (null until mounted, to avoid hydration mismatch) and a setter that remembers the choice. */
export function useTheme() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const el = document.documentElement;
    setDark(el.classList.contains("dark"));
    // Keep every useTheme() in sync (e.g. the toaster) when the class changes.
    const observer = new MutationObserver(() => setDark(el.classList.contains("dark")));
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    // Follow the OS while the user hasn't chosen explicitly.
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onOs = (e: MediaQueryListEvent) => {
      try {
        if (!localStorage.getItem(KEY)) apply(e.matches);
      } catch {
        apply(e.matches);
      }
    };
    media.addEventListener("change", onOs);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onOs);
    };
  }, []);

  const set = (next: boolean) => {
    apply(next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      // Storage unavailable: the switch still works for this page view.
    }
  };

  return { dark, setDark: set };
}
