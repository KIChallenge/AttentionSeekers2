// Recomputes the impact figures of recorded runs without re-running the debate.
// Folds runs/<id>.ndjson, picks the same measures as the runner (accepted proposals, else the
// most accepted open one) and writes runs/<id>.impact.json. The NDJSON files stay untouched;
// the outcome page prefers the sidecar when it exists.
//   node --no-warnings packages/engine/src/impact-cli.ts [runId ...]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson, type Proposal, type RunSnapshot } from "@sv/contracts";
import { REPO_ROOT } from "./config.ts";
import { EVIDENCE, IMPACT_MODEL_VERSION, runImpactFigures } from "./impact.ts";

export function measuresOf(snap: RunSnapshot): Proposal[] {
  const all = Object.values(snap.proposals);
  const accepted = all.filter((p) => p.status === "accepted");
  if (accepted.length) return accepted;
  return all
    .filter((p) => p.status !== "withdrawn")
    .sort((a, b) => b.acceptance - a.acceptance)
    .slice(0, 1);
}

function main() {
  const dir = path.join(REPO_ROOT, "runs");
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(dir)
        .filter((f) => f.endsWith(".ndjson"))
        .map((f) => f.slice(0, -".ndjson".length));
  for (const id of ids) {
    const snap = foldRun(parseNdjson(readFileSync(path.join(dir, `${id}.ndjson`), "utf8")));
    if (!snap.run) continue;
    const measures = measuresOf(snap);
    if (measures.length === 0) {
      console.log(`${id}: no proposals, skipped`);
      continue;
    }
    const figures = runImpactFigures(measures, snap.run.room.budgetCeiling.maxIncreasePct);
    const out = {
      runId: id,
      modelVersion: IMPACT_MODEL_VERSION,
      evidenceVersion: EVIDENCE.version,
      measures: measures.map((p) => p.id),
      figures,
    };
    writeFileSync(path.join(dir, `${id}.impact.json`), `${JSON.stringify(out, null, 2)}\n`);
    const w = figures.find((f) => f.measureId === "package" && f.metric === "wait_change_pct");
    console.log(`${id}: wait ${w?.value} % (${w?.low} to ${w?.high})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
