import { describe, expect, it } from "vitest";
import { pairRelations, rankedPairs } from "./pair-relations";

const pos = (agentId: string, topicId: string, round: number, stance: number) => ({
  agentId,
  topicId,
  round,
  stance,
});
const snap = {
  positions: {
    ak: { t1: [pos("ak", "t1", 1, 1.5)], t2: [pos("ak", "t2", 1, -1)] },
    fm: { t1: [pos("fm", "t1", 1, -1)], t2: [pos("fm", "t2", 1, -1.5)] },
    sv: { t1: [pos("sv", "t1", 1, 0.2)], t2: [pos("sv", "t2", 1, -2)] },
  },
} as never;

describe("pair relations", () => {
  it("counts same and opposite sides, ignores neutral stances", () => {
    const r = pairRelations(snap, ["ak", "fm", "sv"], ["t1", "t2"], 1);
    expect(r.ak?.fm).toEqual({ together: 1, against: 1, topics: 2 });
    expect(r.fm?.sv).toEqual({ together: 1, against: 0, topics: 1 });
    expect(r.ak?.ak).toEqual({ together: 0, against: 0, topics: 0 });
  });

  it("ranks allies before opponents", () => {
    const r = pairRelations(snap, ["ak", "fm", "sv"], ["t1", "t2"], 1);
    const p = rankedPairs(r, ["ak", "fm", "sv"]);
    expect(p[0]?.r.against).toBe(0);
    expect(p.at(-1)?.r.against).toBeGreaterThanOrEqual(1);
  });
});
