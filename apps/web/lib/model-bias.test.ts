import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import {
  axisValue,
  computeModelBias,
  meanAbsGap,
  median,
  SCORE_WEIGHTS,
  scoreOf,
  signedShift,
} from "./model-bias";

const runsDir = path.resolve(__dirname, "../../../runs");
const load = (id: string) => ({
  id,
  snap: foldRun(parseNdjson(readFileSync(path.join(runsDir, `${id}.ndjson`), "utf8"))),
  quality: null,
});

describe("deviation math", () => {
  it("takes the median of the openings", () => {
    expect(median([])).toBeNull();
    expect(median([2, -1, 0])).toBe(0);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("projects stances on an axis by weight and skips missing topics", () => {
    expect(axisValue({ a: 2, b: 0 }, { a: 0.5, b: 0.5 })).toBe(1);
    expect(axisValue({ a: 2, b: null }, { a: 0.3, b: 0.7 })).toBe(2);
    expect(axisValue({}, { a: 1 })).toBeNull();
  });

  it("keeps the sign of a shift and the size of a gap", () => {
    expect(signedShift(0.5, 1.5)).toBe(-1);
    expect(signedShift(null, 1)).toBeNull();
    expect(meanAbsGap({ a: 1, b: -2 }, { a: -1, b: -1 })).toBe(1.5);
    expect(meanAbsGap({ a: null }, { a: 1 })).toBeNull();
  });
});

describe("score math", () => {
  it("weights stance, outcome and quality as documented", () => {
    const s = scoreOf(1, 0, 0.88, 0.9);
    expect(s.stanceTerm).toBe(0.5);
    expect(s.outcomeTerm).toBeCloseTo(0.88);
    expect(s.qualityTerm).toBeCloseTo(0.1);
    const want =
      SCORE_WEIGHTS.stance * 0.5 + SCORE_WEIGHTS.outcome * 0.88 + SCORE_WEIGHTS.quality * 0.1;
    expect(s.score).toBeCloseTo(want);
  });

  it("caps the stance term and renormalises without an audit", () => {
    const s = scoreOf(3, 0.88, 0.88, null);
    expect(s.stanceTerm).toBe(1);
    expect(s.qualityTerm).toBeNull();
    expect(s.score).toBeCloseTo(
      SCORE_WEIGHTS.stance / (SCORE_WEIGHTS.stance + SCORE_WEIGHTS.outcome),
    );
  });

  it("is zero when the run matches the data and the record", () => {
    expect(scoreOf(0, 0.88, 0.88, 1).score).toBe(0);
    expect(scoreOf(null, null, 0.88, null).score).toBeNull();
  });
});

describe("model bias over the ensemble", () => {
  const ids = [
    "ensemble-wartezeiten-gpt",
    "ensemble-wartezeiten-qwen",
    "ensemble-wartezeiten-nova",
  ];
  const mb = computeModelBias(ids.map(load), {
    histRate: 0.88,
    redLines: [{ id: "rl-ak-1", topicKeys: ["pve_planning", "contract_posts"] }],
  });

  it("reads both axes and every seat", () => {
    expect(mb.axes.map((a) => a.id)).toEqual(["x", "y"]);
    expect(mb.agents).toContain("ak");
    expect(mb.rows).toHaveLength(3);
    expect(mb.ranking).toHaveLength(3);
  });

  it("measures each run against the shared expectation", () => {
    for (const r of mb.rows) {
      expect(r.stanceDev).not.toBeNull();
      expect(r.stanceDev ?? -1).toBeGreaterThanOrEqual(0);
      expect(r.direction.x).not.toBeNull();
      expect(r.temperament.redLines).toBeGreaterThan(0);
      expect(r.temperament.held).toBeLessThanOrEqual(r.temperament.redLines);
      expect(r.score.score ?? -1).toBeGreaterThanOrEqual(0);
    }
    const qwen = mb.rows.find((r) => r.id === "ensemble-wartezeiten-qwen");
    expect(qwen?.temperament.accepted).toBe(2);
    const scores = mb.ranking.map((id) => mb.rows.find((r) => r.id === id)?.score.score ?? 0);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });
});
