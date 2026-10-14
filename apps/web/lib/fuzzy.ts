// Fuzzy matching for short names: every word of the query must match a word start, a substring,
// or letters in order ("ujw" → Ujjwal Krishna, "sh nair" → Sharat Nair, "ujwal" → Ujjwal).

function gapsInOrder(text: string, query: string): number | null {
  let from = 0;
  let last = -1;
  let gaps = 0;
  for (const c of query) {
    const at = text.indexOf(c, from);
    if (at < 0) return null;
    if (last >= 0) gaps += at - last - 1;
    last = at;
    from = at + 1;
  }
  return gaps;
}

/** Higher is better; null when the name doesn't match. An empty query matches everything with 0. */
export function fuzzyScore(name: string, query: string): number | null {
  const text = name.toLowerCase();
  const words = text.split(/\s+/);
  let total = 0;
  for (const token of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    let best = -1;
    words.forEach((w, i) => {
      if (w.startsWith(token)) best = Math.max(best, 100 - i * 5 + (w === token ? 10 : 0));
    });
    if (best < 0 && text.includes(token)) best = 50 - Math.min(text.indexOf(token), 20);
    if (best < 0) {
      const gaps = gapsInOrder(text, token);
      if (gaps !== null) best = 25 - Math.min(gaps, 20);
    }
    if (best < 0) return null;
    total += best;
  }
  return total;
}

/** Matching items, best first; ties keep the original order (e.g. most recent first). */
export function fuzzyRank(items: string[], query: string, limit = 50): string[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item, i) => ({ item, i, score: fuzzyScore(item, query) }))
    .filter((x): x is { item: string; i: number; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}
