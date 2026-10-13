// Diagnostic: show what each captured edit_message call contained, and the push-channel events
// that arrived in the seconds after it (decoded from base64 protobuf), to see how edits travel.
// Usage: npx tsx spike/edits.ts [windowSeconds=8]
// Prints edited message text and nearby decoded strings (your own test edits).
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../data/capture");
const windowMs = Number(process.argv[2] ?? 8) * 1000;
type Capture = { seq: number; t: number; kind: string; endpoint: string; body: string | null };
const all: Capture[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)))
  .sort((a, b) => a.t - b.t);
const time = (t: number) => new Date(t).toLocaleTimeString();

function varint(buf: Buffer, i: number): [number, number] {
  let result = 0;
  let mul = 1;
  while (i < buf.length) {
    const b = buf[i++];
    result += (b & 0x7f) * mul;
    if (!(b & 0x80)) return [result, i];
    mul *= 128;
    if (mul > 2 ** 56) break;
  }
  return [0, -1];
}
/** Schema-less protobuf decode → string leaves with field paths, or null if not protobuf. */
function strings(buf: Buffer, prefix = "", depth = 0): { path: string; value: string }[] | null {
  const out: { path: string; value: string }[] = [];
  let i = 0;
  while (i < buf.length) {
    const [key, n] = varint(buf, i);
    if (n < 0 || key === 0) return null;
    i = n;
    const field = Math.floor(key / 8);
    const wire = key % 8;
    const p = prefix ? `${prefix}.${field}` : String(field);
    if (wire === 0) {
      const [, m] = varint(buf, i);
      if (m < 0) return null;
      i = m;
    } else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else if (wire === 2) {
      const [len, m] = varint(buf, i);
      if (m < 0 || m + len > buf.length) return null;
      const sub = buf.subarray(m, m + len);
      i = m + len;
      const nested = depth < 25 && sub.length > 1 ? strings(sub, p, depth + 1) : null;
      const str = sub.toString("utf8");
      const clean = str.length > 0 && Buffer.from(str, "utf8").equals(sub) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(str);
      if (clean && (!nested || /[\s\u0080-￿]/.test(str))) out.push({ path: p, value: str });
      else if (nested) out.push(...nested);
      else if (clean) out.push({ path: p, value: str });
    } else return null;
    if (i > buf.length) return null;
  }
  return out;
}
const boring = (s: string) => /^[A-Za-z0-9_-]{8,}$/.test(s) || /^[A-Za-z0-9+/=]{20,}$/.test(s) || /^\d+$/.test(s) || /^[a-z]{2}$/.test(s);

const edits = all.filter((r) => r.endpoint.endsWith("/edit_message"));
if (!edits.length) console.log("No edit_message calls captured.");
for (const r of edits) {
  console.log(`\n── ${time(r.t)}  ${r.kind}  edit_message (${r.body?.length ?? 0} chars)`);
  console.log(`   ${(r.body ?? "(no body)").replace(/\s+/g, " ").slice(0, 700)}`);
}

const editTimes = edits.filter((r) => r.kind === "request").map((r) => r.t);
for (const t0 of editTimes) {
  console.log(`\n══ Push events within ${windowMs / 1000}s after the edit at ${time(t0)}:`);
  const events = all.filter((r) => r.endpoint.includes("multi-watch/channel") && r.body && r.t >= t0 && r.t <= t0 + windowMs);
  let shown = 0;
  for (const r of events) {
    const body = r.body!.replace(/\\u003d/g, "=");
    for (const m of body.matchAll(/"([A-Za-z0-9+/=_-]{40,})"/g)) {
      const s = strings(Buffer.from(m[1], "base64"));
      if (!s) continue;
      const human = s.filter((x) => !boring(x.value));
      console.log(`   ${time(r.t)}  ${m[1].length}b64 → ${human.length ? human.map((x) => `‹${x.path}› ${JSON.stringify(x.value.slice(0, 80))}`).join("  ") : "(no text fields)"}`);
      shown++;
    }
  }
  if (!shown) console.log("   (no base64 push events in this window)");
}
