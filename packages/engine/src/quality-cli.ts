// Quality audit CLI (separate from cli.ts so other tracks can extend that one freely).
//   quality <runId> [--no-judge] [--estimate] [--max-usd 8] [--out-dir runs]
// Writes runs/<runId>.quality.json and runs/<runId>.quality.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseNdjson, QualityReport } from "@sv/contracts";
import { REPO_ROOT } from "./config.ts";
import { maskDeep } from "./guard.ts";
import { auditRun, isFlagged, prepare, reportMarkdown } from "./quality/audit.ts";
import { estimateJudgeCost } from "./quality/judge.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "no-judge": { type: "boolean" },
    estimate: { type: "boolean" },
    "max-usd": { type: "string" },
    "out-dir": { type: "string" },
  },
});

// The judge shares the Bedrock account quota with live runs; keep its footprint small.
process.env.SV_BEDROCK_CONCURRENCY ??= "2";

async function main() {
  const dir = values["out-dir"] ?? path.join(REPO_ROOT, "runs");
  const ids = positionals.filter((p) => p !== "quality");
  if (ids.length === 0) throw new Error("quality <runId> [...runIds]");
  const maxUsd = Number(values["max-usd"] ?? 8);
  for (const runId of ids) {
    const file = path.join(dir, `${runId}.ndjson`);
    if (!existsSync(file)) throw new Error(`run not found: ${file}`);
    const events = parseNdjson(readFileSync(file, "utf8"));
    if (values.estimate) {
      const p = prepare(events);
      const est = estimateJudgeCost(p.mandate, p.batches);
      process.stdout.write(
        `${JSON.stringify({ runId, utterances: p.prepared.length, batches: p.batches.length, ...est })}\n`,
      );
      continue;
    }
    const started = performance.now();
    const report = await auditRun({
      events,
      noJudge: values["no-judge"],
      maxUsd,
      onEstimate: (e) =>
        process.stderr.write(`quality_estimate ${JSON.stringify({ runId, ...e })}\n`),
    });
    // Judge reasons are model text: same CON guard and house style as the run record.
    const safe = QualityReport.parse(maskDeep(report).value);
    writeFileSync(path.join(dir, `${runId}.quality.json`), `${JSON.stringify(safe, null, 2)}\n`);
    writeFileSync(path.join(dir, `${runId}.quality.md`), reportMarkdown(safe));
    process.stdout.write(
      `${JSON.stringify({
        runId,
        overall: safe.overall.overall,
        flagged: safe.utterances.filter(isFlagged).length,
        utterances: safe.utterances.length,
        judgeCalls: safe.judge.calls,
        judgeFailed: safe.judge.failed,
        costUsd: safe.judge.costUsd,
        seconds: Math.round((performance.now() - started) / 1000),
      })}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(
    `quality_failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
