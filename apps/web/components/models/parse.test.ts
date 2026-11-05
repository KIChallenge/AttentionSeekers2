import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseClassifierReport,
  parseEvalReport,
  parseInfra,
  parseInstitutions,
  parseMdTables,
  verdict,
} from "./parse";

const models = path.resolve(import.meta.dirname, "../../../../models");
const read = (p: string) => readFileSync(path.join(models, p), "utf8");

describe("parseMdTables", () => {
  it("reads header and rows, stops at the first non-table line", () => {
    const t = parseMdTables("x\n| a | b |\n|---|---:|\n| 1 | **2** |\n\n| c |\n|---|\n| 3 |\n");
    expect(t).toHaveLength(2);
    expect(t[0]).toEqual({ header: ["a", "b"], rows: [["1", "**2**"]] });
  });
});

describe("verdict", () => {
  it("uses a tie margin on the in-character difference", () => {
    expect(verdict(0.66, 0.41)).toBe("better");
    expect(verdict(0.595, 0.6227)).toBe("tie");
    expect(verdict(0.1, 0.55)).toBe("worse");
    expect(verdict(null, 0.5)).toBeNull();
  });
});

// The committed result files: if the track rewrites their layout, these fail before the page does.
describe("committed model results", () => {
  it("eval report has nine institutions, the micro row, training and loops", () => {
    const r = parseEvalReport(read("out/eval_sagemaker.md"));
    expect(r.rows).toHaveLength(9);
    expect(r.all?.n).toBe(244);
    expect(r.all?.within1Adapter).toBeTypeOf("number");
    expect(r.training).toHaveLength(9);
    expect(r.training.every((t) => t.evalLoss !== null && t.nTrain !== null)).toBe(true);
    expect(r.loops?.of).toBe(244);
  });

  it("classifier report yields macro F1 and per-class F1", () => {
    const c = parseClassifierReport(read("cards/classifier_report.md"));
    expect(c.macroF1.char).toBeGreaterThan(0.1);
    expect(c.perClass.length).toBeGreaterThanOrEqual(9);
    expect(c.heldoutParagraphs).toBeGreaterThan(0);
  });

  it("README yields the training job and the cost table", () => {
    const i = parseInfra(read("README.md"));
    expect(i.trainingJob).toMatch(/^sv-ki-challenge-lora-/);
    expect(i.billableSeconds).toBeGreaterThan(0);
    expect(i.endpoint).toBe("sv-ki-challenge-personas");
    expect(i.costs.some((c) => c.total)).toBe(true);
  });

  it("institutions.yaml yields a role card per adapter role", () => {
    const cards = parseInstitutions(read("configs/institutions.yaml"));
    const nursing = cards.find((c) => c.role === "nursing");
    expect(nursing?.roleCard).toMatch(/^Sie vertreten/);
    expect(nursing?.roleCard).not.toContain("\n");
  });
});
