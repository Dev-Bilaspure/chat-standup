// Dates are local calendar days as "YYYY-MM-DD"; the Mac's timezone defines day boundaries.

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** [startMs, endMs) covering the local days start..end inclusive. */
export function rangeBounds(start: string, end: string): [number, number] {
  const s = parseDateStr(start);
  const e = parseDateStr(end);
  e.setDate(e.getDate() + 1);
  return [s.getTime(), e.getTime()];
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const d = parseDateStr(start);
  const e = parseDateStr(end);
  while (d <= e) {
    out.push(toDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const isDateStr = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function formatDay(s: string): string {
  return parseDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
