export function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 12431 → "12.4k" */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export const pct =(x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
export const num = (x: number | null, digits = 1) => (x === null ? "–" : x.toFixed(digits));

/** Browser-safe local-date formatting ("YYYY-MM-DD" → "Mon, 12 Oct"). */
export function day(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function period(start: string, end: string): string {
  return start === end ? day(start) : `${day(start)} – ${day(end)}`;
}
