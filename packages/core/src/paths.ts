import fs from "node:fs";
import path from "node:path";

/** Repo root = nearest ancestor of cwd containing pnpm-workspace.yaml (works for the collector and Next.js). */
function findRepoRoot(start: string): string {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export const REPO_ROOT = findRepoRoot(process.cwd());
export const DATA_DIR = process.env.CHAT_NOTES_DATA_DIR ?? path.join(REPO_ROOT, "data");
/** Raw captures written by the collector (one JSONL file per day). */
export const RAW_DIR = path.join(DATA_DIR, "raw");
/** Captures from the feasibility spike; still read by reparse. */
export const SPIKE_CAPTURE_DIR = path.join(DATA_DIR, "capture");
export const DB_PATH = path.join(DATA_DIR, "chat-notes.db");
export const COLLECTOR_PORT = Number(process.env.CHAT_NOTES_PORT ?? 4777);
