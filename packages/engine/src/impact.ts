// Impact model (FR-N3..N6, FR-U6): deterministic arithmetic with documented inputs.
// No official Austrian waiting-time series exists, so the waiting-time effect is an
// openly modelled quantity: capacity gain times an assumed demand elasticity.
import type { ImpactFigure, Proposal } from "@sv/contracts";
import { L } from "./config.ts";

export const IMPACT_MODEL_VERSION = "impact-0.2";
/** Assumed share of extra appointment capacity that turns into shorter waits. */
export const ELASTICITY = { low: 0.5, mid: 0.7, high: 0.9 };
/** Order of magnitude of current health expenditure, EUR bn; an assumption until imported. */
export const DEFAULT_BASELINE_EUR_BN = 52;

const r1 = (x: number) => Math.round(x * 10) / 10;

export function proposalFigures(
  p: Proposal,
  baselineEurBn: number,
  baselineIsAssumption: boolean,
): ImpactFigure[] {
  const out: ImpactFigure[] = [];
  const costInput = {
    name: L("Kostenschätzung des einbringenden Akteurs", "Cost estimate by the proposing actor"),
    value: p.cost ? `${p.cost.value} (${p.cost.low} bis ${p.cost.high}) ${p.cost.unit}` : "keine",
    citation: null,
    assumption: true,
  };
  const baseInput = {
    name: L("Laufende Gesundheitsausgaben, Basis", "Current health expenditure, baseline"),
    value: `${baselineEurBn} Mrd. EUR`,
    citation: null,
    assumption: baselineIsAssumption,
  };
  if (p.cost) {
    out.push({
      measureId: p.id,
      metric: "cost_eur_pa",
      value: p.cost.value,
      low: p.cost.low,
      high: p.cost.high,
      unit: "Mio. EUR p.a.",
      inputs: [costInput],
      formula: "cost = proposer_estimate (low..high)",
      uncertainty: L(
        "Bandbreite aus der Schätzung des einbringenden Akteurs; nicht unabhängig kalkuliert",
        "Range from the proposer's estimate; not independently costed",
      ),
      modelVersion: IMPACT_MODEL_VERSION,
      notModelled: false,
    });
    const pct = (x: number) => Math.round((x / (baselineEurBn * 1000)) * 100 * 100) / 100;
    out.push({
      measureId: p.id,
      metric: "sv_spend_pp",
      value: pct(p.cost.value),
      low: pct(p.cost.low),
      high: pct(p.cost.high),
      unit: "% der Gesundheitsausgaben",
      inputs: [costInput, baseInput],
      formula: "spend_pct = cost_mio / (baseline_bn * 1000) * 100",
      uncertainty: L(
        "Folgt der Kostenbandbreite; Basis ist eine Größenordnung",
        "Follows the cost range; baseline is an order of magnitude",
      ),
      modelVersion: IMPACT_MODEL_VERSION,
      notModelled: false,
    });
  }
  const cap = p.capacityEffect;
  if (cap && cap.value > 0) {
    out.push({
      measureId: p.id,
      metric: "wait_change_pct",
      value: r1(-cap.value * ELASTICITY.mid),
      low: r1(-cap.high * ELASTICITY.high),
      high: r1(-cap.low * ELASTICITY.low),
      unit: "%",
      inputs: [
        {
          name: L(
            "Zusätzliche Terminkapazität (Schätzung des Akteurs)",
            "Extra appointment capacity (actor estimate)",
          ),
          value: `${cap.value} % (${cap.low} bis ${cap.high})`,
          citation: null,
          assumption: true,
        },
        {
          name: L("Elastizität Wartezeit zu Kapazität", "Elasticity of waiting time to capacity"),
          value: `${ELASTICITY.mid} (${ELASTICITY.low} bis ${ELASTICITY.high})`,
          citation: null,
          assumption: true,
        },
      ],
      formula: "dWait_pct = -capacity_pct * elasticity",
      uncertainty: L(
        "Modellierte Größe: es gibt keine amtliche Wartezeitenreihe; Kapazität und Elastizität sind Annahmen",
        "Modelled quantity: no official waiting-time series exists; capacity and elasticity are assumptions",
      ),
      modelVersion: IMPACT_MODEL_VERSION,
      notModelled: false,
    });
  } else {
    out.push({
      measureId: p.id,
      metric: "wait_change_pct",
      value: null,
      low: null,
      high: null,
      unit: "%",
      inputs: [],
      formula: "n/a",
      uncertainty: L(
        "Nicht modelliert: keine Kapazitätswirkung angegeben",
        "Not modelled: no capacity effect stated",
      ),
      modelVersion: IMPACT_MODEL_VERSION,
      notModelled: true,
    });
  }
  return out;
}

/** Package figures: costs add up, capacity effects combine as 1 - prod(1 - c). */
export function packageFigures(
  ps: Proposal[],
  baselineEurBn: number,
  baselineIsAssumption: boolean,
  ceilingPct: number,
  targetWaitPct = 20,
): ImpactFigure[] {
  if (ps.length === 0) return [];
  const costed = ps.filter((p) => p.cost);
  const sum = (k: "value" | "low" | "high") => costed.reduce((a, p) => a + (p.cost?.[k] ?? 0), 0);
  const comb = (k: "value" | "low" | "high") =>
    100 * (1 - ps.reduce((a, p) => a * (1 - Math.max(0, (p.capacityEffect?.[k] ?? 0) / 100)), 1));
  const ids = ps.map((p) => p.id).join(" + ");
  const pct = (x: number) => Math.round((x / (baselineEurBn * 1000)) * 100 * 100) / 100;
  const out: ImpactFigure[] = [
    {
      measureId: "package",
      metric: "cost_eur_pa",
      value: r1(sum("value")),
      low: r1(sum("low")),
      high: r1(sum("high")),
      unit: "Mio. EUR p.a.",
      inputs: costed.map((p) => ({
        name: L(`Kosten ${p.id}`, `Cost ${p.id}`),
        value: `${p.cost?.value} ${p.cost?.unit}`,
        citation: null,
        assumption: true,
      })),
      formula: `sum(cost) over ${ids}`,
      uncertainty: L(
        "Summe der Bandbreiten, Wechselwirkungen nicht modelliert",
        "Sum of ranges, interactions not modelled",
      ),
      modelVersion: IMPACT_MODEL_VERSION,
      notModelled: false,
    },
    {
      measureId: "package",
      metric: "sv_spend_pp",
      value: pct(sum("value")),
      low: pct(sum("low")),
      high: pct(sum("high")),
      unit: `% der Gesundheitsausgaben (Deckel ${ceilingPct} %)`,
      inputs: [
        {
          name: L("Laufende Gesundheitsausgaben, Basis", "Current health expenditure, baseline"),
          value: `${baselineEurBn} Mrd. EUR`,
          citation: null,
          assumption: baselineIsAssumption,
        },
        {
          name: L("Budgetdeckel", "Budget ceiling"),
          value: `${ceilingPct} %`,
          citation: null,
          assumption: false,
        },
      ],
      formula: "spend_pct = sum(cost_mio) / (baseline_bn * 1000) * 100; compare with ceiling",
      uncertainty: L("Folgt den Kostenbandbreiten", "Follows the cost ranges"),
      modelVersion: IMPACT_MODEL_VERSION,
      notModelled: false,
    },
  ];
  const capMid = comb("value");
  if (capMid > 0) {
    out.push({
      measureId: "package",
      metric: "wait_change_pct",
      value: r1(-capMid * ELASTICITY.mid),
      low: r1(-comb("high") * ELASTICITY.high),
      high: r1(-comb("low") * ELASTICITY.low),
      unit: `% (Ziel -${targetWaitPct} %)`,
      inputs: ps
        .filter((p) => p.capacityEffect)
        .map((p) => ({
          name: L(`Kapazität ${p.id}`, `Capacity ${p.id}`),
          value: `${p.capacityEffect?.value} %`,
          citation: null,
          assumption: true,
        })),
      formula: "capacity = 1 - prod(1 - c_i); dWait_pct = -capacity * elasticity",
      uncertainty: L(
        "Modellierte Größe ohne amtliche Wartezeitenreihe; Bandbreite aus Kapazitäts- und Elastizitätsannahmen",
        "Modelled quantity without an official waiting-time series; range from capacity and elasticity assumptions",
      ),
      modelVersion: IMPACT_MODEL_VERSION,
      notModelled: false,
    });
  }
  return out;
}
