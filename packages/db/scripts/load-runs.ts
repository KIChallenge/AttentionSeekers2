// Loads every runs/*.ndjson (or the files given as arguments) into run_events and
// materialises the read models.  pnpm runs:load [--replace] [file...]
// --replace first drops the run's stored events, for run files that were edited in place.
import "./env.ts";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseNdjson } from "@sv/contracts";
import { closeDb, getDb } from "../src/client.ts";
import { eq } from "drizzle-orm";
import { loadRun } from "../src/run-store.ts";
import { runEvents } from "../src/schema.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const dir = path.resolve(root, process.env.SV_REPLAY_DIR ?? "runs");
const args = process.argv.slice(2);
const replace = args.includes("--replace");
const named = args.filter((a) => a !== "--replace");
const files = named.length
  ? named.map((f) => path.resolve(f))
  : readdirSync(dir)
      .filter((f) => f.endsWith(".ndjson"))
      .map((f) => path.join(dir, f));
const db = getDb();
for (const file of files) {
  const events = parseNdjson(readFileSync(file, "utf8"));
  const runId = events[0]?.runId;
  if (replace && runId) await db.delete(runEvents).where(eq(runEvents.runId, runId));
  const snap = await loadRun(db, events);
  console.log(
    `loaded ${snap.runId}: ${snap.lastSeq + 1} events, ${snap.utteranceOrder.length} utterances`,
  );
}
await closeDb();
