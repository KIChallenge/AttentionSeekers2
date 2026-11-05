// Loads every runs/*.ndjson (or the files given as arguments) into run_events and
// materialises the read models.  pnpm runs:load [file...]
import "./env.ts";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseNdjson } from "@sv/contracts";
import { closeDb, getDb } from "../src/client.ts";
import { loadRun } from "../src/run-store.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const dir = path.resolve(root, process.env.SV_REPLAY_DIR ?? "runs");
const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => path.resolve(f))
  : readdirSync(dir)
      .filter((f) => f.endsWith(".ndjson"))
      .map((f) => path.join(dir, f));
const db = getDb();
for (const file of files) {
  const snap = await loadRun(db, parseNdjson(readFileSync(file, "utf8")));
  console.log(
    `loaded ${snap.runId}: ${snap.lastSeq + 1} events, ${snap.utteranceOrder.length} utterances`,
  );
}
await closeDb();
