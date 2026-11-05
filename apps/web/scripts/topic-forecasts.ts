// Caches the historical base rate per measure class for the topic dashboard (FR-J2 to FR-J4,
// FR-J14). One call of the forecasting CLI per class, written to lib/topic-forecasts.json so
// the page never spawns Python at request time.
//
//   pnpm --filter @sv/web topic:forecasts [--date 2026-11-01] [--proposer BMASGPK]
//
// The measure-class rate is descriptive only (keyword rule v1, not preregistered); the CLI says
// so in its note and the page repeats it. Class members are listed from episodes.jsonl with the
// same rule the CLI applies (same measure_class, uncensored, label knowable by the date).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { MeasureClass } from "@sv/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "../..");
const fcDir = path.join(repoRoot, "forecasting");
const out = path.join(webRoot, "lib", "topic-forecasts.json");

const { values } = parseArgs({
  options: { date: { type: "string" }, proposer: { type: "string" } },
});
const date = values.date ?? "2026-11-01";
const proposer = values.proposer ?? "BMASGPK";

interface Rate {
  category: string;
  k: number;
  n: number;
  p: number;
  jeffreys90: [number, number];
}
interface CliRate {
  level: string;
  n: number;
  rates: Rate[];
  small_n_warning: boolean;
  wide_interval_warning?: boolean;
}
interface CliOut {
  pool_size: number;
  status_quo: CliRate;
  forecast_A: CliRate;
  measure_class_rate?: CliRate & { note: string };
}
interface Episode {
  episode_id: string;
  title: string;
  first_draft_date: string;
  measure_class: string;
  outcome: string;
  censored: boolean;
  knowable_date: string;
}

const episodes: Episode[] = readFileSync(path.join(fcDir, "data", "episodes.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const enacted = (r: CliRate | undefined) => r?.rates.find((x) => x.category === "enacted") ?? null;

function cli(measureClass: string): CliOut {
  const stdout = execFileSync(
    "uv",
    [
      "run",
      "--quiet",
      "python",
      "-m",
      "svforecast.cli",
      "forecast",
      "--measure-class",
      measureClass,
      "--proposer",
      proposer,
      "--date",
      date,
      "--k",
      "5",
    ],
    { cwd: fcDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(stdout);
}

/**
 * The engine's measure classes are finer than the registry's keyword rule v1, which never
 * assigns these six. Each gets the nearest registry class, shown on the page as a mapping
 * ("via"), never silently.
 */
const NEAREST: Record<string, string> = {
  capacity_expansion: "workforce",
  scope_of_practice: "workforce",
  fee_change: "financing_rule",
  capacity_reduction: "structural_reform",
  service_restriction: "access_rule",
  new_service: "access_rule",
};

const classes: Record<string, unknown> = {};
let overall: { k: number; n: number; low: number; high: number } | null = null;
for (const own of MeasureClass.options) {
  const mc = NEAREST[own] ?? own;
  const res = cli(mc);
  const sq = enacted(res.status_quo);
  if (sq && !overall) overall = { k: sq.k, n: sq.n, low: sq.jeffreys90[0], high: sq.jeffreys90[1] };
  const r = enacted(res.measure_class_rate);
  const members = episodes
    .filter((e) => e.measure_class === mc && !e.censored && e.knowable_date <= date)
    .sort((a, b) => b.first_draft_date.localeCompare(a.first_draft_date));
  classes[own] = {
    via: mc === own ? null : mc,
    n: r?.n ?? 0,
    k: r?.k ?? 0,
    low: r?.jeffreys90[0] ?? null,
    high: r?.jeffreys90[1] ?? null,
    smallN: res.measure_class_rate?.small_n_warning ?? true,
    modified: members.filter((e) => e.outcome === "partially_implemented").length,
    analogs: members.slice(0, 5).map((e) => ({
      episodeId: e.episode_id,
      title: e.title,
      date: e.first_draft_date,
      outcome: e.outcome,
    })),
  };
  process.stdout.write(`${own.padEnd(22)} ${mc.padEnd(22)} ${r ? `${r.k}/${r.n}` : "n=0"}\n`);
}

writeFileSync(
  out,
  `${JSON.stringify(
    {
      generatedFor: { date, proposer },
      source: "forecasting/ svforecast.cli forecast --measure-class (descriptive class rate)",
      overall,
      baselineVerdict: "inconclusive at this N",
      classes,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`wrote ${path.relative(repoRoot, out)}\n`);
