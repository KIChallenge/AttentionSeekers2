// Offline compromise consistency check over recorded runs; writes runs/<id>.compromise.json.
// Usage: pnpm --filter @sv/engine compromise <runId...> | --all   [--dir runs] [--model id]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { foldRun, parseNdjson } from "@sv/contracts";
import {
  checkCompromiseConsistency,
  consistencyNote,
  writeConsistencySidecar,
} from "./compromise-consistency.ts";
import { REPO_ROOT } from "./config.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { all: { type: "boolean" }, dir: { type: "string" }, model: { type: "string" } },
});
const dir = values.dir ?? path.join(REPO_ROOT, "runs");
const ids = values.all
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".ndjson"))
      .map((f) => f.slice(0, -".ndjson".length))
  : positionals;

async function one(id: string) {
  const file = path.join(dir, `${id}.ndjson`);
  if (!existsSync(file)) throw new Error(`run not found: ${file}`);
  const snap = foldRun(parseNdjson(readFileSync(file, "utf8")));
  if (!snap.compromise || !snap.run) return null;
  const model = values.model ?? snap.run.room.expertModel;
  const { consistency } = await checkCompromiseConsistency(
    id,
    snap.compromise,
    Object.values(snap.compromiseVotes ?? {}),
    snap.compromiseResult ?? null,
    model,
  );
  writeConsistencySidecar(dir, consistency);
  return consistency;
}

const results = await Promise.allSettled(ids.map(one));
for (const [i, r] of results.entries()) {
  if (r.status === "rejected") {
    console.error(`${ids[i]}: failed ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    process.exitCode = 1;
  } else if (r.value) console.log(`${ids[i]}: ${consistencyNote(r.value).text}`);
}
