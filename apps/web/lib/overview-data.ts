// Server-only loader for the home page overview: archive counts from Postgres, the persona
// evaluation, the forecasting registry, the backtest note and the run files. Every number is
// read at request time; the archive counts are cached in data.server.ts, the rest is cheap.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ArchiveOverview, archiveOverview } from "@/components/archive/data.server";
import { type Fidelity, loadModelsData } from "@/components/models/data.server";
import { loadModelBias } from "./model-bias-data";
import {
  type BacktestFacts,
  type ForecastFacts,
  forecastFacts,
  parseBacktest,
  type SimulationTotals,
  simulationTotals,
} from "./overview";
import { loadQualityReport } from "./quality";
import type { RunColumn } from "./topic-compare";
import type { loadAll } from "./topic-runs";

const cwd = process.cwd();
const repoRoot = path.resolve(
  /*turbopackIgnore: true*/ cwd,
  cwd.endsWith(path.join("apps", "web")) ? "../.." : ".",
);

async function readText(rel: string): Promise<string | null> {
  try {
    return await readFile(path.join(/*turbopackIgnore: true*/ repoRoot, rel), "utf8");
  } catch {
    return null;
  }
}

export interface RankedRun {
  rank: number;
  run: RunColumn;
  tier: "near" | "mid" | "far";
}

export interface Overview {
  archive: ArchiveOverview;
  /** Press pages indexed for the source check (distinct original pages). */
  pressPages: number;
  fidelity: Fidelity | null;
  forecast: ForecastFacts | null;
  backtest: BacktestFacts | null;
  simulation: SimulationTotals;
  /** Model ranking of the scenario with the most runs, "erwartbar" first. */
  ranking: { scenarioKey: string; rows: RankedRun[] } | null;
}

async function pressPageCount(): Promise<number> {
  const pages = (await import("./press-pages.json")).default as Record<string, { pageId: number }>;
  return new Set(Object.values(pages).map((p) => p.pageId)).size;
}

async function rankingOf(scenarioKey: string | null): Promise<Overview["ranking"]> {
  if (!scenarioKey) return null;
  const bias = await loadModelBias(scenarioKey);
  if (!bias) return null;
  const runs = new Map(bias.runs.map((r) => [r.id, r]));
  const n = bias.bias.ranking.length;
  const rows = bias.bias.ranking.flatMap((id, i) => {
    const run = runs.get(id);
    if (!run) return [];
    const tier = i < n / 3 ? "near" : i < (2 * n) / 3 ? "mid" : "far";
    return [{ rank: i + 1, run, tier } as RankedRun];
  });
  return rows.length ? { scenarioKey, rows } : null;
}

export async function loadOverview(
  loaded: Awaited<ReturnType<typeof loadAll>>,
  rankingScenario: string | null,
): Promise<Overview> {
  const items = [...loaded.values()];
  const [archive, pressPages, models, registry, episodes, scores, backtestMd, qualities, ranking] =
    await Promise.all([
      archiveOverview(),
      pressPageCount(),
      loadModelsData(),
      readText("forecasting/data/registry.jsonl"),
      readText("forecasting/data/episodes.jsonl"),
      readText("forecasting/data/scores.json"),
      readText("docs/backtest-svog-2018.md"),
      Promise.all(items.map((x) => loadQualityReport(x.summary.id))),
      rankingOf(rankingScenario),
    ]);
  let scoresJson: unknown = null;
  try {
    scoresJson = scores ? JSON.parse(scores) : null;
  } catch {
    scoresJson = null;
  }
  return {
    archive,
    pressPages,
    fidelity: models.fidelity,
    forecast: registry && episodes ? forecastFacts(registry, episodes, scoresJson) : null,
    backtest: backtestMd ? parseBacktest(backtestMd) : null,
    simulation: simulationTotals(
      items.map((x, i) => ({ ...x, quality: qualities[i]?.overall.overall ?? null })),
    ),
    ranking,
  };
}
