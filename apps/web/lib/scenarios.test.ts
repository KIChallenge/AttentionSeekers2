import type { RunSummary } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { groupScenarios, modalRoundLimit, parseScenarioKey, scenarioKey } from "./scenarios";

const run = (over: Partial<RunSummary> & { id: string }): RunSummary => ({
  question: "Wie können die Wartezeiten sinken?",
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
  agents: ["gm", "sv"],
  models: ["azure/gpt-6-sol"],
  acceptedProposals: 1,
  rejectedProposals: 0,
  isReference: false,
  endCondition: null,
  ...over,
});

describe("scenarios", () => {
  it("round-trips the route key", () => {
    expect(scenarioKey("wartezeiten", "main")).toBe("wartezeiten");
    expect(parseScenarioKey("wartezeiten")).toEqual({ baseKey: "wartezeiten", kind: "main" });
    expect(parseScenarioKey("wartezeiten.checks")).toEqual({
      baseKey: "wartezeiten",
      kind: "checks",
    });
    expect(parseScenarioKey(scenarioKey("q-1234abcd", "demo"))).toEqual({
      baseKey: "q-1234abcd",
      kind: "demo",
    });
  });

  it("takes the most frequent round limit, longer on ties", () => {
    expect(modalRoundLimit([{ roundLimit: 5 }, { roundLimit: 2 }, { roundLimit: 5 }])).toBe(5);
    expect(modalRoundLimit([{ roundLimit: 2 }, { roundLimit: 5 }])).toBe(5);
    expect(modalRoundLimit([])).toBe(0);
  });

  it("splits one question into main, check and demo groups from metadata", () => {
    const runs = [
      run({ id: "reference-x", isReference: true, models: ["azure/gpt-6-sol", "bedrock/nova"] }),
      run({ id: "ensemble-x-glm", variantKind: "model_ensemble", models: ["bedrock/zai.glm-5"] }),
      run({ id: "gate-check-x", roundLimit: 2, roundsCompleted: 2 }),
      run({ id: "fixture-x", isReference: true, models: ["azure/gpt-5-mini"] }),
      run({
        id: "backtest-a",
        template: "backtest_svog_2018",
        question: "Was wird aus dem SV-OG?",
        createdAt: "2026-11-06T10:00:00Z",
      }),
    ];
    const s = groupScenarios(runs);
    expect(s.map((x) => [x.key, x.kind, x.runs.length])).toEqual([
      ["wartezeiten", "main", 2],
      ["backtest_svog_2018", "main", 1],
      ["wartezeiten.checks", "checks", 1],
      ["wartezeiten.demo", "demo", 1],
    ]);
    const main = s[0];
    expect(main?.referenceRunId).toBe("reference-x");
    expect(main?.families).toEqual(["glm", "gpt", "nova"]);
    expect(main?.roundLimit).toBe(5);
    expect(s[2]?.roundLimit).toBe(2);
  });

  it("keeps custom questions apart by their hash", () => {
    const s = groupScenarios([
      run({ id: "a", template: "custom", question: "Frage eins" }),
      run({ id: "b", template: "custom", question: "Frage zwei" }),
      run({ id: "c", template: "custom", question: "frage eins " }),
    ]);
    expect(s).toHaveLength(2);
    expect(s[0]?.runs.map((r) => r.id)).toEqual(["a", "c"]);
  });
});
