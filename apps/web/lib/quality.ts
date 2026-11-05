// Quality report loader: runs/<runId>.quality.json written by `pnpm --filter engine
// quality <runId>`. Server-only; a missing or invalid file means "not audited yet".
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { QualityReport } from "@sv/contracts";
import { isRunId, replayDir } from "./runs";

export async function loadQualityReport(runId: string): Promise<QualityReport | null> {
  if (!isRunId(runId)) return null;
  const file = path.join(/*turbopackIgnore: true*/ replayDir(), `${runId}.quality.json`);
  if (!existsSync(file)) return null;
  try {
    const parsed = QualityReport.safeParse(JSON.parse(await readFile(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
