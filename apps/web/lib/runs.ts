// Run loader: database first (when DATABASE_URL is reachable), NDJSON files in
// SV_REPLAY_DIR (default <repo>/runs) as the fallback, so the reference run replays
// with Docker down (acceptance 19). Server-only.
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  foldRun,
  parseNdjson,
  type RunEvent,
  type RunSnapshot,
  type RunSummary,
  summarizeRun,
} from "@sv/contracts";

const cwd = process.cwd();
const repoRoot = path.resolve(
  /*turbopackIgnore: true*/ cwd,
  cwd.endsWith(path.join("apps", "web")) ? "../.." : ".",
);

export function replayDir(): string {
  const dir = process.env.SV_REPLAY_DIR ?? "runs";
  return path.isAbsolute(dir) ? dir : path.join(/*turbopackIgnore: true*/ repoRoot, dir);
}

const RUN_ID = /^[a-zA-Z0-9_.-]{1,120}$/;
export function isRunId(id: string): boolean {
  return RUN_ID.test(id) && !id.includes("..");
}

async function fromDb<T>(
  fn: (db: import("@sv/db").Db, store: typeof import("@sv/db")) => Promise<T>,
): Promise<T | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const store = await import("@sv/db");
    return await fn(store.getDb(), store);
  } catch (error) {
    console.warn("run_store_unavailable", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function loadRunEvents(runId: string): Promise<RunEvent[] | null> {
  if (!isRunId(runId)) return null;
  const db = await fromDb((db, s) => s.readRunEvents(db, runId));
  if (db && db.length > 0) return db;
  const file = path.join(/*turbopackIgnore: true*/ replayDir(), `${runId}.ndjson`);
  if (!existsSync(file)) return null;
  return parseNdjson(await readFile(file, "utf8"));
}

export async function loadRunSnapshot(runId: string): Promise<RunSnapshot | null> {
  const events = await loadRunEvents(runId);
  return events ? foldRun(events) : null;
}

export async function listRuns(): Promise<RunSummary[]> {
  const byId = new Map<string, RunSummary>();
  const dbRows = await fromDb((db, s) => s.listRunSummaries(db));
  for (const row of dbRows ?? []) if (row.summary) byId.set(row.id, row.summary as RunSummary);
  const dir = replayDir();
  if (existsSync(dir)) {
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".ndjson")) continue;
      const id = f.slice(0, -".ndjson".length);
      if (byId.has(id)) continue;
      try {
        byId.set(
          id,
          summarizeRun(
            foldRun(
              parseNdjson(await readFile(path.join(/*turbopackIgnore: true*/ dir, f), "utf8")),
            ),
          ),
        );
      } catch (error) {
        console.warn("run_file_invalid", f, error instanceof Error ? error.message : error);
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      Number(b.isReference) - Number(a.isReference) || b.createdAt.localeCompare(a.createdAt),
  );
}
