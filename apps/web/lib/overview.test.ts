import type { RunSnapshot, RunSummary } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import type { Fidelity } from "@/components/models/data.server";
import {
  adapterVersions,
  adapterWins,
  bestApproach,
  forecastFacts,
  parseBacktest,
  simulationTotals,
  stanceArms,
} from "./overview";

const scores = (adapter: number, baseline: number, char = 0.4) => ({
  n: 10,
  adapter: char,
  baseline: 0.45,
  stance_sign_adapter: adapter,
  stance_sign_baseline: baseline,
  within1_adapter: 0.6,
  within1_baseline: 0.6,
});

const arm = (version: string, inst: Record<string, [number, number]>, kind?: string) => ({
  version,
  run: version,
  kind,
  institutions: Object.fromEntries(Object.entries(inst).map(([k, [a, b]]) => [k, scores(a, b)])),
  all: scores(0, 0),
});

const fidelity: Fidelity = {
  metric: "m",
  split: "s",
  institutions: {},
  all: { n: 30, adapter: 0.4, baseline: 0.45 },
  versions: {
    v1: arm("v1", { a: [0.4, 0.5], b: [0.4, 0.5], c: [0.6, 0.5] }),
    "v1-fix": arm("v1-fix", { a: [0.45, 0.5], b: [0.4, 0.5], c: [0.6, 0.5] }),
    v2: arm("v2", { a: [0.2, 0.5], b: [0.3, 0.5], c: [0.3, 0.5] }),
    "v2.1": arm("v2.1", { a: [0.6, 0.5], b: [0.6, 0.5], c: [0.4, 0.5] }),
    "card-x": arm(
      "card-x",
      { a: [0.55, 0.55], b: [0.55, 0.55], c: [0.55, 0.55] },
      "context_persona",
    ),
    "dossier-x": arm(
      "dossier-x",
      { a: [0.7, 0.55], b: [0.6, 0.55], c: [0.6, 0.55] },
      "context_persona",
    ),
  },
};

describe("persona models", () => {
  it("counts adapters per training version only", () => {
    expect(adapterVersions(fidelity)).toEqual([
      { version: "v1", adapters: 3 },
      { version: "v2", adapters: 3 },
      { version: "v2.1", adapters: 3 },
    ]);
  });

  it("counts the institutions the best adapter beats its base on", () => {
    const v21 = fidelity.versions?.["v2.1"];
    expect(v21 && adapterWins(v21)).toEqual({ wins: 2, of: 3 });
  });

  it("ranks base, adapters and the best in-context arm by stance direction", () => {
    expect(stanceArms(fidelity).map((a) => [a.key, a.kind])).toEqual([
      ["dossier-x", "context"],
      ["v2.1", "adapter"],
      ["base", "base"],
      ["v1", "adapter"],
      ["v2", "adapter"],
    ]);
  });

  it("names the best in-context approach with its scores", () => {
    const b = bestApproach(fidelity);
    expect(b?.key).toBe("dossier-x");
    expect(b?.model).toBe("x");
    expect(b?.prompt).toBe("dossier");
    expect(b?.sign).toBeCloseTo(0.6333, 3);
    expect(b?.char).toBeCloseTo(0.4, 3);
  });

  it("returns nothing without a fidelity file", () => {
    expect(adapterVersions(null)).toEqual([]);
    expect(stanceArms(null)).toEqual([]);
    expect(bestApproach(null)).toBeNull();
  });
});

describe("forecasting", () => {
  it("reads drafts, years, labelled episodes and the primary verdict", () => {
    const registry = [
      { first_draft_date: "2008-01-04" },
      { first_draft_date: "2026-03-01" },
      { first_draft_date: "2015-06-01" },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n");
    const episodes = [
      { fr_j1a_label: "implemented" },
      { fr_j1a_label: "unknown" },
      { outcome: "lapsed" },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n");
    const scores = {
      "main/binary": {
        n: 2,
        category_counts: { enacted: 1, not_enacted: 1 },
        verdict_A_primary: "inconclusive at this N",
      },
    };
    expect(forecastFacts(registry, episodes, scores)).toEqual({
      drafts: 3,
      years: { min: 2008, max: 2026 },
      episodes: 3,
      labelled: 2,
      scored: 2,
      enacted: 1,
      verdict: "inconclusive at this N",
    });
  });

  it("counts the provisions where the simulated government stayed below the law", () => {
    const md = [
      "# Backtest",
      "",
      "| Provision | Draft | Law 2018 | After VfGH 2019 | Sim government | Sim consensus | Proposals |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| A | +2 | +2 | +2 | 1.75 | 1.0 | none |",
      "| B | +2 | +2 | +2 | 2.0 | 0.75 | none |",
      "| C | +2 | +2 (RH 2022) | +2 | 0.0 | 0.5 | none |",
      "",
      "Text after.",
    ].join("\n");
    expect(parseBacktest(md)).toEqual({ softer: 2, of: 3 });
    expect(parseBacktest("no table")).toBeNull();
  });
});

describe("simulation totals", () => {
  const summary = (id: string, models: string[]): RunSummary => ({
    id,
    question: "q",
    template: "wartezeiten",
    createdAt: "2026-11-05T10:00:00Z",
    variantKind: "baseline",
    status: "completed",
    outcomeBadge: "majority",
    agreementShare: { agreed: 2, of: 3 },
    movedMost: null,
    durationMs: 1000,
    roundsCompleted: 5,
    roundLimit: 5,
    agents: ["gm"],
    models,
    acceptedProposals: 1,
    rejectedProposals: 0,
    isReference: false,
    endCondition: "convergence",
  });
  const snap = (calls: Array<[number, number, number, number | null]>) =>
    ({
      llmCalls: calls.map(([tokensIn, tokensOut, tokensReasoning, costUsd]) => ({
        tokensIn,
        tokensOut,
        tokensReasoning,
        costUsd,
      })),
    }) as unknown as RunSnapshot;

  it("sums calls, tokens and priced cost and averages the audits", () => {
    const t = simulationTotals([
      {
        summary: summary("a", ["azure/gpt-6-sol"]),
        snap: snap([
          [100, 10, 0, 0.5],
          [200, 20, 5, null],
        ]),
        quality: 0.9,
      },
      {
        summary: summary("b", ["bedrock/qwen.qwen3-235b", "azure/gpt-6-sol"]),
        snap: snap([[50, 5, 0, 0.25]]),
        quality: null,
      },
    ]);
    expect(t).toEqual({
      runs: 2,
      completed: 2,
      families: ["gpt", "qwen"],
      calls: 3,
      tokens: 390,
      costUsd: 0.75,
      quality: 0.9,
      audited: 1,
    });
  });

  it("reports no cost and no quality when nothing was priced or audited", () => {
    const t = simulationTotals([
      { summary: summary("a", []), snap: snap([[1, 1, 0, null]]), quality: null },
    ]);
    expect(t.costUsd).toBeNull();
    expect(t.quality).toBeNull();
  });
});
