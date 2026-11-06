import type { Proposal } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import {
  BRIEF_MEASURE_ID,
  briefScenarioFigures,
  classifyProposal,
  combineAcrossGroups,
  combineWithinGroup,
  EVIDENCE,
  type Mechanism,
  mechanismReduction,
  packageEffect,
  phaseIn,
  runImpactFigures,
  statedPosts,
} from "../src/impact.ts";

const T = (text: string) => ({ lang: "de" as const, text, translations: {} });
function proposal(id: string, title: string, components: string[] = [], extra = {}): Proposal {
  return {
    id,
    title: T(title),
    components: components.map(T),
    status: "accepted",
    cost: null,
    capacityEffect: null,
    ...extra,
  } as unknown as Proposal;
}
const mech = (
  cls: Mechanism["cls"],
  restricted = false,
  posts: number | null = null,
): Mechanism => ({
  cls,
  restricted,
  posts,
  origin: "t",
});

describe("combination rules", () => {
  it("discounts overlapping effects inside a group, largest first", () => {
    expect(combineWithinGroup([1, 4, 2], 0.5)).toBeCloseTo(4 + 1 + 0.25);
    expect(combineWithinGroup([], 0.5)).toBe(0);
  });

  it("combines groups with diminishing returns", () => {
    expect(combineAcrossGroups([10, 10])).toBeCloseTo(19);
    expect(combineAcrossGroups([10, 10])).toBeLessThan(20);
    expect(combineAcrossGroups([])).toBe(0);
  });

  it("phases effects in linearly and caps at one", () => {
    expect(phaseIn(1, 2)).toBe(0.5);
    expect(phaseIn(5, 3)).toBe(1);
    expect(phaseIn(0, 3)).toBe(0);
  });

  it("does not double count a class brought in by two proposals", () => {
    const once = packageEffect([mech("telemedicine")]);
    const twice = packageEffect([mech("telemedicine"), mech("telemedicine")]);
    expect(twice.reduction).toEqual(once.reduction);
    expect(twice.costMioEurPa).toEqual(once.costMioEurPa);
  });

  it("keeps low <= central <= high through the package", () => {
    const e = packageEffect([
      mech("capacity_expansion"),
      mech("triage_routing"),
      mech("telemedicine", true),
      mech("monitoring_transparency"),
    ]);
    expect(e.reduction.low).toBeLessThanOrEqual(e.reduction.central);
    expect(e.reduction.central).toBeLessThanOrEqual(e.reduction.high);
    expect(e.costMioEurPa.low).toBeLessThanOrEqual(e.costMioEurPa.high);
  });

  it("scales restricted measures by the scope factor", () => {
    const full = mechanismReduction(mech("triage_routing")).central;
    const part = mechanismReduction(mech("triage_routing", true)).central;
    expect(part).toBeCloseTo(full * EVIDENCE.rules.restrictedScope.central);
  });

  it("derives capacity from the stated number of posts", () => {
    const r = mechanismReduction(mech("capacity_expansion", true, 415)).central;
    const c = EVIDENCE.classes.capacity_expansion.capacity;
    expect(r).toBeCloseTo(
      (415 / 4147) * 100 * (c?.fillRate.central ?? 0) * (c?.elasticity.central ?? 0),
    );
  });
});

describe("classification", () => {
  it("reads several mechanisms out of a package proposal", () => {
    const p = proposal("p-1", "Wartezeiten-Paket", [
      "Telemedizin für ausgewählte Leistungen",
      "300 Kassenstellen gestaffelt in Mangelregionen",
      "Terminservice 1450",
      "Wartezeiten-Dashboard",
    ]);
    const cls = classifyProposal(p).map((m) => m.cls);
    expect(cls).toEqual(
      expect.arrayContaining([
        "telemedicine",
        "capacity_expansion",
        "triage_routing",
        "monitoring_transparency",
      ]),
    );
    expect(classifyProposal(p).find((m) => m.cls === "capacity_expansion")?.posts).toBe(300);
  });

  it("falls back to the measure class", () => {
    const p = proposal("p-2", "Effiziente Ressourcen", [], { measureClass: "workforce" });
    expect(classifyProposal(p).map((m) => m.cls)).toEqual(["scope_of_practice"]);
  });

  it("finds post counts, not money", () => {
    expect(statedPosts("1000 neue kassenärztlichen facharztstellen")).toBe(1000);
    expect(statedPosts("kostendeckel 180 mio. eur jährlich")).toBeNull();
  });
});

describe("figures", () => {
  it("computes the brief package with the same model", () => {
    const f = briefScenarioFigures();
    const wait = f.find((x) => x.metric === "wait_change_pct");
    expect(wait?.measureId).toBe(BRIEF_MEASURE_ID);
    expect(wait?.basis).toBe("evidence");
    expect(wait?.sourceCount).toBeGreaterThan(5);
    // The evidence supports far less than the brief's -22 % at the central estimate.
    expect(wait?.value ?? 0).toBeGreaterThan(-22);
  });

  it("keeps proposer estimates as a secondary basis", () => {
    const p = proposal("p-3", "Zusätzliche Kassenstellen", [], {
      cost: { value: 100, low: 80, high: 120, unit: "Mio. EUR p.a." },
      capacityEffect: { value: 10, low: 5, high: 15, unit: "%" },
    });
    const figs = runImpactFigures([p], 4);
    expect(
      figs.find((f) => f.measureId === "package" && f.metric === "wait_change_pct")?.basis,
    ).toBe("evidence");
    expect(
      figs.find((f) => f.measureId === "proposer:package" && f.metric === "wait_change_pct")?.basis,
    ).toBe("proposer");
  });
});
