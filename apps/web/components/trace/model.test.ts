import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { buildTrace, runningTotals, totals } from "./model";

// The committed 2-round demo run carries recorded llm.call events.
const file = path.resolve(import.meta.dirname, "../../../../runs/demo-agent-trace.ndjson");
const snap = foldRun(parseNdjson(readFileSync(file, "utf8")));

describe("agent trace model", () => {
  it("groups every call into round, group and turn exactly once", () => {
    const rounds = buildTrace(snap.llmCalls, snap);
    const placed = rounds.flatMap((r) => r.groups.flatMap((g) => g.turns.flatMap((t) => t.calls)));
    expect(placed).toHaveLength(snap.llmCalls.length);
    expect(rounds.map((r) => r.round)).toEqual([null, 1, 2]);
    // utterance calls sit in the exchange of their utterance
    for (const r of rounds)
      for (const g of r.groups)
        for (const t of g.turns)
          if (t.kind === "utterance" && t.ref && g.exchangeId)
            expect(snap.utterances[t.ref]?.exchangeId).toBe(g.exchangeId);
  });

  it("totals match the per-call sums and the running total ends there", () => {
    const t = totals(snap.llmCalls);
    const cost = snap.llmCalls.reduce((a, c) => a + (c.costUsd ?? 0), 0);
    expect(t.calls).toBe(snap.llmCalls.length);
    expect(t.costUsd).toBeCloseTo(cost, 9);
    expect(t.byFamily.reduce((a, f) => a + f.calls, 0)).toBe(t.calls);
    const run = runningTotals(snap.llmCalls);
    expect(Math.max(...[...run.values()].map((v) => v.costUsd))).toBeCloseTo(cost, 9);
  });
});
