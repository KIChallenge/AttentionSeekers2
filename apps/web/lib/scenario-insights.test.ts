import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson, summarizeRun } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { coalitionPatterns, perspectives } from "./scenario-insights";

const runsDir = path.resolve(__dirname, "../../../runs");
const load = (id: string) => {
  const snap = foldRun(parseNdjson(readFileSync(path.join(runsDir, `${id}.ndjson`), "utf8")));
  return { summary: summarizeRun(snap), snap };
};
const items = [load("reference-wartezeiten"), load("reference-wartezeiten-presse")];

describe("perspectives across runs", () => {
  const rows = perspectives(items);

  it("has one row per seat with one final stance per run and topic", () => {
    expect(rows.map((r) => r.agentId)).toContain("ak");
    const ak = rows.find((r) => r.agentId === "ak");
    expect(ak?.topics.length).toBeGreaterThan(0);
    for (const tp of ak?.topics ?? []) {
      expect(tp.finals).toHaveLength(2);
      expect(tp.start === null || Math.abs(tp.start) <= 2).toBe(true);
    }
    expect(ak?.runIds).toEqual(["reference-wartezeiten", "reference-wartezeiten-presse"]);
  });

  it("counts red lines and votes over both runs", () => {
    const totalVotes = rows.reduce((n, r) => n + r.supported.length + r.opposed.length, 0);
    expect(totalVotes).toBeGreaterThan(0);
    for (const r of rows)
      for (const rl of r.redLines) expect(rl.runsTouched).toBeLessThanOrEqual(rl.touched);
    const fm = rows.find((r) => r.agentId === "fm");
    expect(fm?.moved).toBeGreaterThanOrEqual(0);
  });
});

describe("coalition patterns", () => {
  const cp = coalitionPatterns(items);

  it("builds a symmetric co-alignment matrix bounded by shared votes", () => {
    const { agentIds, same, both } = cp.matrix;
    expect(agentIds.length).toBeGreaterThan(2);
    for (let i = 0; i < agentIds.length; i++)
      for (let j = 0; j < agentIds.length; j++) {
        expect(same[i]?.[j]).toBe(same[j]?.[i]);
        expect(same[i]?.[j] ?? 0).toBeLessThanOrEqual(both[i]?.[j] ?? 0);
      }
    expect(cp.pairs[0]?.same).toBeGreaterThan(0);
  });

  it("lists every accepted or rejected proposal with its calculus verdict", () => {
    const decided = items.flatMap(({ snap }) =>
      snap.proposalOrder.filter((id) => {
        const s = snap.proposals[id]?.status;
        return s === "accepted" || s === "rejected";
      }),
    );
    expect(cp.verdicts).toHaveLength(decided.length);
    const scored = cp.verdicts.filter(
      (v) => v.minimalWinningCoalitions.length || v.blockers.length,
    );
    expect(scored.length).toBeGreaterThan(0);
    for (const b of cp.blockers) expect(b.count).toBeLessThanOrEqual(b.of);
  });
});
