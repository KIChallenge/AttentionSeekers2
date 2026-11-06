// Home page overview: pure readings over the team's committed results (persona evaluation,
// forecasting registry, backtest note, run files). The server loader (overview-data.ts) only
// reads files and hands them here, so the numbers are testable without the file system.
import type { RunSnapshot, RunSummary } from "@sv/contracts";
import { type Arm, armModel, micro, pickArms } from "@/components/models/arms";
import type { Fidelity } from "@/components/models/data.server";
import { familyOf } from "./topic-compare";

// ---------- data base ----------

/** Source kinds the home chart shows on their own; everything else folds into "other". */
export const KIND_ORDER = ["stellungnahme", "press", "law", "other"] as const;
export type KindKey = (typeof KIND_ORDER)[number];

// ---------- persona models ----------

/** Adapter versions are the keys that name a training version (v1, v2, v2.1); re-evaluations
 * of the same weights (v1-fix) and in-context arms are not new adapters. */
export const ADAPTER_VERSION = /^v\d+(?:\.\d+)*$/;

export interface AdapterVersion {
  version: string;
  adapters: number;
}

export function adapterVersions(f: Fidelity | null): AdapterVersion[] {
  return Object.entries(f?.versions ?? {})
    .filter(([k, a]) => ADAPTER_VERSION.test(k) && a.kind !== "context_persona")
    .map(([version, a]) => ({ version, adapters: Object.keys(a.institutions).length }));
}

/** Institutions whose stance direction the arm's adapter side beats its base side on. */
export function adapterWins(arm: Arm): { wins: number; of: number } {
  const rows = Object.values(arm.institutions);
  return {
    wins: rows.filter((s) => s.stance_sign_adapter > s.stance_sign_baseline).length,
    of: rows.length,
  };
}

export interface StanceArm {
  key: string;
  kind: "base" | "adapter" | "context";
  /** Stance direction agreement 0..1 (micro-average over institutions). */
  sign: number;
}

/**
 * Arms for the stance-direction chart: the prompted base of the best adapter, every adapter
 * version, and the best in-context arm. Sorted by score so the chart reads as a ranking.
 */
export function stanceArms(f: Fidelity | null): StanceArm[] {
  const pick = pickArms(f);
  if (!pick) return [];
  const out: StanceArm[] = [];
  const base = micro(pick.adapter[1], "baseline").sign;
  if (base !== null) out.push({ key: "base", kind: "base", sign: base });
  for (const [key, arm] of [...pick.rest, pick.adapter]) {
    if (!ADAPTER_VERSION.test(key)) continue;
    const sign = micro(arm, "adapter").sign;
    if (sign !== null) out.push({ key, kind: "adapter", sign });
  }
  if (pick.context) {
    const sign = micro(pick.context[1], "adapter").sign;
    if (sign !== null) out.push({ key: pick.context[0], kind: "context", sign });
  }
  return out.sort((a, b) => b.sign - a.sign);
}

export interface BestApproach {
  key: string;
  model: string;
  prompt: "dossier" | "card";
  sign: number | null;
  char: number | null;
}

export function bestApproach(f: Fidelity | null): BestApproach | null {
  const ctx = pickArms(f)?.context;
  if (!ctx) return null;
  const m = micro(ctx[1], "adapter");
  return {
    key: ctx[0],
    model: armModel(ctx[0]),
    prompt: ctx[0].startsWith("card-") ? "card" : "dossier",
    sign: m.sign,
    char: m.char,
  };
}

// ---------- forecasting ----------

export interface ForecastFacts {
  drafts: number;
  years: { min: number; max: number } | null;
  episodes: number;
  labelled: number;
  /** Episodes scored in the primary binary set, and those enacted within the horizon. */
  scored: number;
  enacted: number;
  verdict: string | null;
}

function jsonLines<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as T];
      } catch {
        return [];
      }
    });
}

export function forecastFacts(registry: string, episodes: string, scores: unknown): ForecastFacts {
  const drafts = jsonLines<{ first_draft_date?: string }>(registry);
  const years = drafts
    .map((d) => Number(d.first_draft_date?.slice(0, 4)))
    .filter((y) => Number.isFinite(y) && y > 0);
  const eps = jsonLines<{ outcome?: string; fr_j1a_label?: string }>(episodes);
  const labelled = eps.filter((e) => {
    const l = e.fr_j1a_label ?? e.outcome;
    return l && l !== "unknown";
  }).length;
  const main = (scores as Record<string, unknown> | null)?.["main/binary"] as
    | { n?: number; category_counts?: Record<string, number>; verdict_A_primary?: string }
    | undefined;
  return {
    drafts: drafts.length,
    years: years.length ? { min: Math.min(...years), max: Math.max(...years) } : null,
    episodes: eps.length,
    labelled,
    scored: main?.n ?? 0,
    enacted: main?.category_counts?.enacted ?? 0,
    verdict: main?.verdict_A_primary ?? null,
  };
}

export interface BacktestFacts {
  /** Provisions on which the simulated government seats ended below the law. */
  softer: number;
  of: number;
}

/**
 * Reads the provision table of docs/backtest-svog-2018.md: columns Draft, Law 2018, After
 * VfGH, Sim government, Sim consensus. A provision counts as softer when the simulated
 * government value lies below the law's value.
 */
export function parseBacktest(md: string): BacktestFacts | null {
  const lines = md.split("\n");
  const head = lines.findIndex((l) => /^\|\s*Provision/i.test(l));
  if (head < 0) return null;
  let softer = 0;
  let of = 0;
  for (const line of lines.slice(head + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").map((c) => c.trim());
    const law = Number.parseFloat(cells[3] ?? "");
    const sim = Number.parseFloat(cells[5] ?? "");
    if (!Number.isFinite(law) || !Number.isFinite(sim)) continue;
    of++;
    if (sim < law) softer++;
  }
  return of ? { softer, of } : null;
}

// ---------- simulation ----------

export interface SimulationTotals {
  runs: number;
  completed: number;
  families: string[];
  calls: number;
  tokens: number;
  /** Price-table estimate summed over every recorded call; null when nothing was priced. */
  costUsd: number | null;
  /** Mean overall audit score over the audited runs, null when none is audited. */
  quality: number | null;
  audited: number;
}

export function simulationTotals(
  items: Array<{ summary: RunSummary; snap: RunSnapshot; quality: number | null }>,
): SimulationTotals {
  const families = new Set<string>();
  let calls = 0;
  let tokens = 0;
  let cost = 0;
  let priced = 0;
  const qualities: number[] = [];
  for (const { summary, snap, quality } of items) {
    for (const m of summary.models) families.add(familyOf(m));
    calls += snap.llmCalls.length;
    for (const c of snap.llmCalls) {
      tokens += c.tokensIn + c.tokensOut + c.tokensReasoning;
      if (c.costUsd !== null) {
        cost += c.costUsd;
        priced++;
      }
    }
    if (quality !== null) qualities.push(quality);
  }
  return {
    runs: items.length,
    completed: items.filter((x) => x.summary.status === "completed").length,
    families: [...families].filter((f) => f !== "unknown").sort(),
    calls,
    tokens,
    costUsd: priced ? cost : null,
    quality: qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null,
    audited: qualities.length,
  };
}
