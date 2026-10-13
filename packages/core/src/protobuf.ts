// Minimal schema-less protobuf reader. Google Chat's live events are protobuf; we only read
// the handful of fields we've mapped, by field number.

export type Field = { no: number; wire: number; int?: bigint; bytes?: Buffer };

const ZERO = BigInt(0);
const SEVEN = BigInt(7);
const THREE = BigInt(3);
const LOW3 = BigInt(7);

function varint(buf: Buffer, i: number): [bigint, number] {
  let result = ZERO;
  let shift = ZERO;
  while (i < buf.length) {
    const b = buf[i++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, i];
    shift += SEVEN;
    if (shift > BigInt(70)) break;
  }
  return [ZERO, -1];
}

/** Top-level fields of a message, or null if the bytes aren't valid protobuf. */
export function readFields(buf: Buffer): Field[] | null {
  const out: Field[] = [];
  let i = 0;
  while (i < buf.length) {
    const [key, n] = varint(buf, i);
    if (n < 0 || key === ZERO) return null;
    i = n;
    const no = Number(key >> THREE);
    const wire = Number(key & LOW3);
    if (wire === 0) {
      const [v, m] = varint(buf, i);
      if (m < 0) return null;
      out.push({ no, wire, int: v });
      i = m;
    } else if (wire === 2) {
      const [len, m] = varint(buf, i);
      const end = m + Number(len);
      if (m < 0 || end > buf.length) return null;
      out.push({ no, wire, bytes: buf.subarray(m, end) });
      i = end;
    } else if (wire === 1) {
      i += 8;
    } else if (wire === 5) {
      i += 4;
    } else {
      return null;
    }
    if (i > buf.length) return null;
  }
  return out;
}

/** All embedded messages at a field path, e.g. path(buf, 8, 6, 1). */
export function pathAll(buf: Buffer, ...nos: number[]): Buffer[] {
  let level: Buffer[] = [buf];
  for (const no of nos) {
    const next: Buffer[] = [];
    for (const b of level) for (const f of readFields(b) ?? []) if (f.no === no && f.bytes) next.push(f.bytes);
    level = next;
  }
  return level;
}

export const path1 = (buf: Buffer | undefined, ...nos: number[]) => (buf ? pathAll(buf, ...nos)[0] : undefined);

export function str(buf: Buffer | undefined, no: number): string | undefined {
  if (!buf) return undefined;
  const f = readFields(buf)?.find((x) => x.no === no && x.bytes);
  return f?.bytes?.toString("utf8");
}

export function int(buf: Buffer | undefined, no: number): bigint | undefined {
  if (!buf) return undefined;
  return readFields(buf)?.find((x) => x.no === no && x.int !== undefined)?.int;
}
