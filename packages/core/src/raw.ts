import fs from "node:fs";
import path from "node:path";
import type { CaptureRecord } from "./parse";
import { RAW_DIR, SPIKE_CAPTURE_DIR } from "./paths";

/** Every raw capture record on disk, oldest first (by time, then per-page sequence). */
export function readRawRecords(): { records: CaptureRecord[]; files: number } {
  const files = [SPIKE_CAPTURE_DIR, RAW_DIR]
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(d, f)));
  const records: CaptureRecord[] = [];
  for (const f of files) {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        // skip a partial line
      }
    }
  }
  records.sort((a, b) => a.t - b.t || a.seq - b.seq);
  return { records, files: files.length };
}
