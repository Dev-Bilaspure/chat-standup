"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
export type SaveFn = (value: string, opts: { keepalive?: boolean }) => Promise<void>;

/**
 * Saves a text value while the user types, with no save button.
 * - Saves after a short pause (debounce), and at least every `maxWait` ms while typing continues.
 * - One save at a time, always with the latest value, so an older value can never overwrite a newer one.
 * - Failed saves retry with backoff; typing again retries immediately.
 * - Unsaved text is saved on flush() (call it on blur), when the tab is hidden, and when the page or
 *   component goes away (keepalive request). Leaving the page with unsaved text asks first.
 */
export function useAutosave(initial: string, save: SaveFn, { delay = 500, maxWait = 2500 } = {}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const latest = useRef(initial);
  const saved = useRef(initial);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSince = useRef<number | null>(null);
  const failures = useRef(0);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    // A save is running; it checks for newer text when it finishes.
    if (inFlight.current) return;
    if (latest.current === saved.current) {
      pendingSince.current = null;
      setStatus((s) => (s === "idle" ? s : "saved"));
      return;
    }
    const value = latest.current;
    inFlight.current = true;
    setStatus("saving");
    try {
      await saveRef.current(value, {});
      saved.current = value;
      failures.current = 0;
    } catch {
      inFlight.current = false;
      failures.current++;
      setStatus("error");
      timer.current = setTimeout(flush, Math.min(30_000, 1000 * 2 ** failures.current));
      return;
    }
    inFlight.current = false;
    if (latest.current !== saved.current) return flush();
    pendingSince.current = null;
    setStatus("saved");
  }, []);

  const set = useCallback(
    (value: string) => {
      latest.current = value;
      clearTimeout(timer.current);
      if (value === saved.current && !inFlight.current) {
        pendingSince.current = null;
        setStatus((s) => (s === "idle" ? s : "saved"));
        return;
      }
      setStatus((s) => (s === "saving" ? s : "pending"));
      const now = Date.now();
      pendingSince.current ??= now;
      const wait = Math.max(0, Math.min(delay, pendingSince.current + maxWait - now));
      timer.current = setTimeout(flush, wait);
    },
    [delay, maxWait, flush],
  );

  useEffect(() => {
    const unsaved = () => latest.current !== saved.current;
    // Tab hidden: the page is still alive, so a normal (ordered) save works.
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && unsaved()) void flush();
    };
    // Page going away: fire-and-forget with keepalive so the request outlives the page.
    const onPageHide = () => {
      if (unsaved()) void saveRef.current(latest.current, { keepalive: true }).catch(() => {});
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsaved() || inFlight.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Unmounted (filtered out, navigated away) with unsaved text.
      clearTimeout(timer.current);
      if (unsaved()) void saveRef.current(latest.current, { keepalive: true }).catch(() => {});
    };
  }, [flush]);

  return { status, set, flush };
}
