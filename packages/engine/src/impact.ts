// Impact model (FR-N3..N6, FR-U6): deterministic arithmetic with documented inputs.
//
// Primary figures come from the evidence table (config/impact-evidence.json): every measure
// class carries a low, central and high effect on the average specialist waiting time and a
// yearly cost range, each with its sources or marked as an assumption. The proposers' own
// estimates stay as a secondary "Schätzung der Vorschlagenden" (measureId "proposer:<id>").
//
// Combination rules (documented in the figures' formula field, tested in test/impact.test.ts):
//   1. Classify: each proposal maps to evidence classes by keywords in title and components,
//      falling back to its measureClass.
//   2. No double counting: a class counts once per package (the strongest instance wins).
//   3. Scope: measures limited to selected services, shortage regions or a trial act on the
//      national average with the restrictedScope factor (an assumption).
//   4. Phase-in: a class reaches its full effect linearly over rampYears; figures report the
//      end of the five-year horizon, the first year is listed as an input.
//   5. Overlap: inside a mechanism group (supply, demand, governance, ...) effects add with a
//      geometric discount, v1 + d*v2 + d^2*v3 (d = overlapDiscount), largest first.
//   6. Diminishing returns across groups: R = 1 - prod(1 - r_g).
//   7. The range is carried through: all lows combine to the low, all highs to the high.
//   Costs add up; the spending share divides by current health expenditure 2024.
import type { ImpactFigure, LocalizedText, MeasureClass, Proposal } from "@sv/contracts";
import evidenceJson from "../config/impact-evidence.json" with { type: "json" };

export const IMPACT_MODEL_VERSION = "impact-0.3-evidence";

export interface Range {
  low: number;
  central: number;
  high: number;
}
type Bi = { de: string; en: string };
interface SourceEntry {
  title: string;
  publisher: string;
  year: number;
  url: string;
  kind: string;
  finding: Bi;
}
interface ClassEntry {
  label: Bi;
  group: string;
  basis: "derived" | "assumption";
  rampYears: number;
  waitReductionPct?: Range;
  costMioEurPa?: Range;
  capacity?: {
    defaultPosts: Range;
    elasticity: Range;
    fillRate: Range;
    costPerPostMioEur: Range;
  };
  derivation: Bi;
  sources: string[];
}
export interface EvidenceTable {
  version: string;
  horizonYears: number;
  sources: Record<string, SourceEntry>;
  baselines: {
    healthExpenditureMioEur: { value: number; year: number; sources: string[] };
    svHealthExpenditureMioEur: { value: number; year: number; sources: string[] };
    contractSpecialists: { value: number; year: number; sources: string[] };
    [k: string]: unknown;
  };
  rules: { overlapDiscount: number; restrictedScope: Range; restrictedScopeNote: Bi };
  classes: Record<EvidenceClass, ClassEntry>;
  briefPackage: {
    label: Bi;
    claimed: { waitChangePct: number; budgetChangePct: number };
    components: Array<{ class: EvidenceClass; restricted: boolean; text: Bi }>;
  };
}
export type EvidenceClass =
  | "capacity_expansion"
  | "fee_incentive"
  | "triage_routing"
  | "telemedicine"
  | "scope_of_practice"
  | "access_guarantee"
  | "monitoring_transparency"
  | "structural_reform"
  | "financing_rule"
  | "other";

export const EVIDENCE = evidenceJson as unknown as EvidenceTable;

/** Current health expenditure 2024, EUR bn (Statistik Austria, SHA). */
export const DEFAULT_BASELINE_EUR_BN =
  Math.round(EVIDENCE.baselines.healthExpenditureMioEur.value / 100) / 10;

const L = (de: string, en?: string): LocalizedText => ({
  lang: "de",
  text: de,
  translations: en ? { en } : {},
});
const bi = (b: Bi) => L(b.de, b.en);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const KEYS = ["low", "central", "high"] as const;
const mapRange = (f: (k: (typeof KEYS)[number]) => number): Range => ({
  low: f("low"),
  central: f("central"),
  high: f("high"),
});

// ---------------------------------------------------------------- classification

export interface Mechanism {
  cls: EvidenceClass;
  restricted: boolean;
  /** Stated number of new posts (capacity_expansion only); null = not stated. */
  posts: number | null;
  /** Proposal id or component label that brought it in. */
  origin: string;
}

const PRIMARY: Array<[EvidenceClass, RegExp]> = [
  [
    "capacity_expansion",
    /kassenstelle|facharztstelle|facharzt-kassenstelle|zusatztermin|zusätzliche[^|]{0,30}termin|terminkontingent|facharztkontingent|terminangebot|kapazitätsausbau|kapazitätsaufbau|notordination/,
  ],
  [
    "triage_routing",
    /1450|triage|terminservice|terminvermittlung|vermittlung|vermittelt|lenkung|ticket|terminplattform|terminsteuerung|terminvernetzung|koordinationsstelle|zuweisung/,
  ],
  ["telemedicine", /telemed|telekonsult|ekonsil|e-konsil|videokonsult/],
  [
    "scope_of_practice",
    /pflegerisch|pflegeexpert|pflegekompetenz|community.nursing|skill-mix|assistent|gukg|gesundheitsberufe/,
  ],
  [
    "access_guarantee",
    /vierwochen|vier wochen|4-wochen|terminzusage|terminpflicht|zugangsgarantie|terminangebot binnen/,
  ],
  [
    "monitoring_transparency",
    /monitoring|transparenz|dashboard|veröffentlich|wartezeitstatistik|wartezeiten messen|messung|messen|gemessen/,
  ],
];
const SECONDARY: Array<[EvidenceClass, RegExp]> = [
  ["fee_incentive", /honorarerhöhung|honoraranreiz|gesamtvertragsvolumen/],
  [
    "structural_reform",
    /primärversorgungseinheiten|versorgungspfad|sektorenübergreif|verlagerung|strukturreform|planungshoheit/,
  ],
  ["financing_rule", /umschichtung|kostenneutral|ressourcenausnutzung/],
];
const FALLBACK: Partial<Record<MeasureClass, EvidenceClass>> = {
  capacity_expansion: "capacity_expansion",
  workforce: "scope_of_practice",
  scope_of_practice: "scope_of_practice",
  digitalisation: "triage_routing",
  access_rule: "access_guarantee",
  monitoring_reporting: "monitoring_transparency",
  fee_change: "fee_incentive",
  structural_reform: "structural_reform",
  financing_rule: "financing_rule",
};
const SECONDARY_BY_CLASS: Partial<Record<MeasureClass, EvidenceClass>> = {
  fee_change: "fee_incentive",
  structural_reform: "structural_reform",
  financing_rule: "financing_rule",
};
const RESTRICTED =
  /mangelregion|unterversorgte[n]? region|ausgewählte|befrist|pilot|erprobung|zwölfmonat|zwölf monate|versuch|in drei regionen/;
const POSTS = /(\d{2,5})\s+(?:[a-zäöüß-]+\s+){0,3}[a-zäöüß-]*stellen\b/g;

export function proposalText(p: Proposal): string {
  return [p.title.text, ...(p.components ?? []).map((c) => c.text)].join(" | ").toLowerCase();
}

export function statedPosts(text: string): number | null {
  let best: number | null = null;
  for (const m of text.matchAll(POSTS)) {
    const n = Number(m[1]);
    if (n >= 20 && n <= 5000) best = Math.max(best ?? 0, n);
  }
  return best;
}

/** Evidence classes a proposal carries (rule 1). */
export function classifyProposal(p: Proposal): Mechanism[] {
  const text = proposalText(p);
  const restricted = RESTRICTED.test(text);
  const found = new Set<EvidenceClass>();
  for (const [cls, re] of PRIMARY) if (re.test(text)) found.add(cls);
  const sec = p.measureClass ? SECONDARY_BY_CLASS[p.measureClass] : undefined;
  if (sec) found.add(sec);
  if (found.size === 0) for (const [cls, re] of SECONDARY) if (re.test(text)) found.add(cls);
  if (found.size === 0) found.add((p.measureClass && FALLBACK[p.measureClass]) || "other");
  const posts = statedPosts(text);
  return [...found].map((cls) => ({
    cls,
    restricted,
    posts: cls === "capacity_expansion" ? posts : null,
    origin: p.id,
  }));
}

// ---------------------------------------------------------------- arithmetic

/** Rule 4: share of the full effect reached in year t. */
export function phaseIn(year: number, rampYears: number): number {
  if (rampYears <= 0) return 1;
  return Math.max(0, Math.min(1, year / rampYears));
}

/** Rule 5: geometric overlap discount inside one mechanism group, largest first. */
export function combineWithinGroup(values: number[], discount = EVIDENCE.rules.overlapDiscount) {
  return [...values].sort((a, b) => b - a).reduce((acc, v, i) => acc + v * discount ** i, 0);
}

/** Rule 6: diminishing combination across groups, values and result in percent. */
export function combineAcrossGroups(values: number[]): number {
  return 100 * (1 - values.reduce((acc, v) => acc * (1 - v / 100), 1));
}

function scopeFactor(m: Mechanism): Range {
  // A stated post count already sets the scale of a capacity measure.
  if (!m.restricted || (m.cls === "capacity_expansion" && m.posts !== null))
    return { low: 1, central: 1, high: 1 };
  return EVIDENCE.rules.restrictedScope;
}

function postsOf(m: Mechanism, e: ClassEntry): Range {
  const d = e.capacity?.defaultPosts ?? { low: 0, central: 0, high: 0 };
  return m.posts !== null ? { low: m.posts, central: m.posts, high: m.posts } : d;
}

/** Full-scale reduction of the average specialist wait in percent, before phase-in. */
export function mechanismReduction(m: Mechanism, table: EvidenceTable = EVIDENCE): Range {
  const e = table.classes[m.cls];
  const s = scopeFactor(m);
  if (e.capacity) {
    const c = e.capacity;
    const posts = postsOf(m, e);
    const base = table.baselines.contractSpecialists.value;
    return mapRange((k) => (posts[k] / base) * 100 * c.fillRate[k] * c.elasticity[k] * s[k]);
  }
  const w = e.waitReductionPct ?? { low: 0, central: 0, high: 0 };
  return mapRange((k) => w[k] * s[k]);
}

/** Yearly cost in EUR m at full scale. */
export function mechanismCost(m: Mechanism, table: EvidenceTable = EVIDENCE): Range {
  const e = table.classes[m.cls];
  const s = scopeFactor(m);
  if (e.capacity) {
    const c = e.capacity;
    const posts = postsOf(m, e);
    return mapRange((k) => posts[k] * c.costPerPostMioEur[k] * c.fillRate[k] * s[k]);
  }
  const c = e.costMioEurPa ?? { low: 0, central: 0, high: 0 };
  return mapRange((k) => c[k] * s[k]);
}

/** Rule 2: one instance per class, the one with the larger central effect. */
export function dedupe(ms: Mechanism[], table: EvidenceTable = EVIDENCE): Mechanism[] {
  const by = new Map<EvidenceClass, Mechanism>();
  for (const m of ms) {
    const cur = by.get(m.cls);
    if (!cur) {
      by.set(m.cls, m);
      continue;
    }
    const d = mechanismReduction(m, table).central - mechanismReduction(cur, table).central;
    if (d > 0 || (d === 0 && mechanismCost(m, table).central > mechanismCost(cur, table).central))
      by.set(m.cls, m);
  }
  return [...by.values()];
}

export interface PackageEffect {
  /** Reduction of the average specialist wait in percent (positive = shorter). */
  reduction: Range;
  /** Reduction in the first year, central only. */
  reductionYear1: number;
  costMioEurPa: Range;
  classes: EvidenceClass[];
  sourceIds: string[];
}

function reductionAt(ms: Mechanism[], year: number, table: EvidenceTable): Range {
  return mapRange((k) => {
    const groups = new Map<string, number[]>();
    for (const m of ms) {
      const e = table.classes[m.cls];
      const v = mechanismReduction(m, table)[k] * phaseIn(year, e.rampYears);
      groups.set(e.group, [...(groups.get(e.group) ?? []), v]);
    }
    return combineAcrossGroups([...groups.values()].map((vs) => combineWithinGroup(vs)));
  });
}

export function packageEffect(raw: Mechanism[], table: EvidenceTable = EVIDENCE): PackageEffect {
  const ms = dedupe(raw, table);
  const reduction = reductionAt(ms, table.horizonYears, table);
  const reductionYear1 = reductionAt(ms, 1, table).central;
  const costs = ms.map((m) => mechanismCost(m, table));
  const costMioEurPa = mapRange((k) => costs.reduce((a, c) => a + c[k], 0));
  const classes = ms.map((m) => m.cls);
  const sourceIds = [...new Set(classes.flatMap((c) => table.classes[c].sources))];
  return { reduction, reductionYear1, costMioEurPa, classes, sourceIds };
}

// ---------------------------------------------------------------- figures

const FORMULA_WAIT =
  "classes deduplicated; r_class = effect * scope * phase_in(year 5); group = r1 + 0.5*r2 + 0.25*r3; total = 1 - prod(1 - group); dWait = -total";

function evidenceInputs(eff: PackageEffect, table: EvidenceTable) {
  return eff.classes.map((c) => {
    const e = table.classes[c];
    return {
      name: bi(e.label),
      value: `${e.basis === "assumption" ? "Annahme" : `${e.sources.length} Quellen`}`,
      citation: null,
      assumption: e.basis === "assumption",
    };
  });
}

/** Evidence-based figures for one measure or a package (wait, cost, spending share). */
export function evidenceFigures(
  measureId: string,
  mechanisms: Mechanism[],
  opts: { ceilingPct?: number; targetWaitPct?: number; table?: EvidenceTable } = {},
): ImpactFigure[] {
  const table = opts.table ?? EVIDENCE;
  if (mechanisms.length === 0) return [];
  const eff = packageEffect(mechanisms, table);
  const base = table.baselines.healthExpenditureMioEur;
  const tag = {
    modelVersion: IMPACT_MODEL_VERSION,
    notModelled: false,
    basis: "evidence" as const,
    evidenceClasses: eff.classes,
    sourceCount: eff.sourceIds.length,
  };
  const inputs = evidenceInputs(eff, table);
  const pct = (x: number) => r2((x / base.value) * 100);
  const anyAssumption = eff.classes.some((c) => table.classes[c].basis === "assumption");
  return [
    {
      measureId,
      metric: "wait_change_pct",
      value: r1(-eff.reduction.central),
      low: r1(-eff.reduction.high),
      high: r1(-eff.reduction.low),
      unit: opts.targetWaitPct ? `% (Ziel -${opts.targetWaitPct} %)` : "%",
      inputs: [
        ...inputs,
        {
          name: L("Wirkung im ersten Jahr", "Effect in year one"),
          value: `${r1(-eff.reductionYear1)} %`,
          citation: null,
          assumption: false,
        },
      ],
      formula: FORMULA_WAIT,
      uncertainty: L(
        `Bandbreite aus der Evidenztabelle (${eff.sourceIds.length} Quellen), Jahr ${table.horizonYears}; keine amtliche Wartezeitenreihe${anyAssumption ? "; enthält Annahmen ohne Evidenz" : ""}`,
        `Range from the evidence table (${eff.sourceIds.length} sources), year ${table.horizonYears}; no official waiting-time series${anyAssumption ? "; includes assumptions without evidence" : ""}`,
      ),
      ...tag,
    },
    {
      measureId,
      metric: "cost_eur_pa",
      value: r1(eff.costMioEurPa.central),
      low: r1(eff.costMioEurPa.low),
      high: r1(eff.costMioEurPa.high),
      unit: "Mio. EUR p.a.",
      inputs,
      formula: "cost = sum over classes (posts * cost_per_post * fill_rate, or class cost range)",
      uncertainty: L(
        "Kostenbandbreiten je Klasse, großteils Annahmen; Wechselwirkungen nicht modelliert",
        "Cost ranges per class, mostly assumptions; interactions not modelled",
      ),
      ...tag,
    },
    {
      measureId,
      metric: "sv_spend_pp",
      value: pct(eff.costMioEurPa.central),
      low: pct(eff.costMioEurPa.low),
      high: pct(eff.costMioEurPa.high),
      unit:
        opts.ceilingPct !== undefined
          ? `% der Gesundheitsausgaben (Deckel ${opts.ceilingPct} %)`
          : "% der Gesundheitsausgaben",
      inputs: [
        {
          name: L(
            `Laufende Gesundheitsausgaben ${base.year}`,
            `Current health expenditure ${base.year}`,
          ),
          value: `${(base.value / 1000).toFixed(1)} Mrd. EUR`,
          citation: null,
          assumption: false,
        },
      ],
      formula: "spend_pct = cost_mio / health_expenditure_mio * 100",
      uncertainty: L(
        "Folgt der Kostenbandbreite; Basis Statistik Austria",
        "Follows the cost range; baseline Statistik Austria",
      ),
      ...tag,
    },
  ];
}

export function briefMechanisms(table: EvidenceTable = EVIDENCE): Mechanism[] {
  return table.briefPackage.components.map((c) => ({
    cls: c.class,
    restricted: c.restricted,
    posts: null,
    origin: "brief",
  }));
}

export const BRIEF_MEASURE_ID = "scenario:brief";
export const PROPOSER_PREFIX = "proposer:";

/** The brief's example package computed with the same model. */
export function briefScenarioFigures(table: EvidenceTable = EVIDENCE): ImpactFigure[] {
  return evidenceFigures(BRIEF_MEASURE_ID, briefMechanisms(table), { table });
}

/** All impact figures for a run's measures: evidence first, proposer estimates second. */
export function runImpactFigures(
  measures: Proposal[],
  ceilingPct: number,
  targetWaitPct = 20,
): ImpactFigure[] {
  const baselineEurBn = DEFAULT_BASELINE_EUR_BN;
  return [
    ...measures.flatMap((p) => evidenceFigures(p.id, classifyProposal(p))),
    ...evidenceFigures("package", measures.flatMap(classifyProposal), {
      ceilingPct,
      targetWaitPct,
    }),
    ...measures.flatMap((p) =>
      proposalFigures(p, baselineEurBn, false).map((f) => ({
        ...f,
        measureId: `${PROPOSER_PREFIX}${f.measureId}`,
      })),
    ),
    ...packageFigures(measures, baselineEurBn, ceilingPct, targetWaitPct).map((f) => ({
      ...f,
      measureId: `${PROPOSER_PREFIX}package`,
    })),
  ];
}

// ---------------------------------------------------------------- proposer estimates

/** Assumed share of extra appointment capacity that turns into shorter waits. */
export const ELASTICITY = { low: 0.5, mid: 0.7, high: 0.9 };
const PROPOSER_VERSION = "impact-0.2-proposer";

export function proposalFigures(
  p: Proposal,
  baselineEurBn: number,
  baselineIsAssumption: boolean,
): ImpactFigure[] {
  const out: ImpactFigure[] = [];
  const tag = { modelVersion: PROPOSER_VERSION, basis: "proposer" as const };
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
      notModelled: false,
      ...tag,
    });
    const pct = (x: number) => r2((x / (baselineEurBn * 1000)) * 100);
    out.push({
      measureId: p.id,
      metric: "sv_spend_pp",
      value: pct(p.cost.value),
      low: pct(p.cost.low),
      high: pct(p.cost.high),
      unit: "% der Gesundheitsausgaben",
      inputs: [costInput, baseInput],
      formula: "spend_pct = cost_mio / (baseline_bn * 1000) * 100",
      uncertainty: L("Folgt der Kostenbandbreite", "Follows the cost range"),
      notModelled: false,
      ...tag,
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
      ],
      formula: "dWait_pct = -capacity_pct * elasticity",
      uncertainty: L(
        "Schätzung der Vorschlagenden; Kapazität und Elastizität sind Annahmen",
        "Proposers' estimate; capacity and elasticity are assumptions",
      ),
      notModelled: false,
      ...tag,
    });
  }
  return out;
}

/** Proposer package: costs add up, capacity effects combine as 1 - prod(1 - c). */
export function packageFigures(
  ps: Proposal[],
  baselineEurBn: number,
  ceilingPct: number,
  targetWaitPct = 20,
): ImpactFigure[] {
  if (ps.length === 0) return [];
  const tag = { modelVersion: PROPOSER_VERSION, basis: "proposer" as const, notModelled: false };
  const costed = ps.filter((p) => p.cost);
  const sum = (k: "value" | "low" | "high") => costed.reduce((a, p) => a + (p.cost?.[k] ?? 0), 0);
  const comb = (k: "value" | "low" | "high") =>
    100 * (1 - ps.reduce((a, p) => a * (1 - Math.max(0, (p.capacityEffect?.[k] ?? 0) / 100)), 1));
  const pct = (x: number) => r2((x / (baselineEurBn * 1000)) * 100);
  const out: ImpactFigure[] = [];
  if (costed.length) {
    out.push(
      {
        measureId: "package",
        metric: "cost_eur_pa",
        value: r1(sum("value")),
        low: r1(sum("low")),
        high: r1(sum("high")),
        unit: "Mio. EUR p.a.",
        inputs: [],
        formula: "sum(cost) over proposals",
        uncertainty: L("Summe der Schätzungen", "Sum of the estimates"),
        ...tag,
      },
      {
        measureId: "package",
        metric: "sv_spend_pp",
        value: pct(sum("value")),
        low: pct(sum("low")),
        high: pct(sum("high")),
        unit: `% der Gesundheitsausgaben (Deckel ${ceilingPct} %)`,
        inputs: [],
        formula: "spend_pct = sum(cost_mio) / (baseline_bn * 1000) * 100",
        uncertainty: L("Folgt den Schätzungen", "Follows the estimates"),
        ...tag,
      },
    );
  }
  const capMid = comb("value");
  if (capMid > 0) {
    out.push({
      measureId: "package",
      metric: "wait_change_pct",
      value: r1(-capMid * ELASTICITY.mid),
      low: r1(-comb("high") * ELASTICITY.high),
      high: r1(-comb("low") * ELASTICITY.low),
      unit: `% (Ziel -${targetWaitPct} %)`,
      inputs: [],
      formula: "capacity = 1 - prod(1 - c_i); dWait_pct = -capacity * elasticity",
      uncertainty: L(
        "Schätzung der Vorschlagenden, nicht unabhängig geprüft",
        "Proposers' estimate, not independently checked",
      ),
      ...tag,
    });
  }
  return out;
}
