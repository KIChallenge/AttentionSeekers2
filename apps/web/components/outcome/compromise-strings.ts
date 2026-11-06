// Strings and pure helpers for the moderator's compromise package; server-safe (no React),
// shared by the outcome page, the result document, its HTML export and the scenario tabs.
import {
  type CompromiseConsistency,
  type CompromiseResult,
  catalogAgent,
  type LocalizedText,
} from "@sv/contracts";

type Lang = "de" | "en";

export const nameOf = (id: string, lang: Lang) => {
  const a = catalogAgent(id);
  return a ? (lang === "en" ? a.glossEn : a.nameDe) : id;
};

export const tx = (t: LocalizedText | null | undefined, lang: Lang) =>
  t ? (lang === "en" ? (t.translations?.en ?? t.text) : t.text) : "";

export const COMPROMISE_T = {
  de: {
    title: "Kompromissvorschlag des Moderators",
    passes: "trägt unter Bedingungen",
    fails: "gescheitert",
    components: "Bausteine",
    conditions: "Bedingungen",
    support: "dafür",
    conditional: "bedingt",
    oppose: "dagegen",
    redLines: "Berührte rote Linien",
    kind: {
      financing: "Finanzierung",
      evaluation: "Evaluierung",
      sunset: "Befristung",
      pilot: "Pilot",
      governance: "Zuständigkeit",
      other: "Bedingung",
    },
    none: "Kein Kompromissvorschlag in diesem Lauf.",
    consistency: "Konsistenzprüfung des Experten",
    verdict: {
      carries: "trägt",
      carries_if_reconciled: "trägt nur, wenn die Bedingungen vereinbar sind",
      fails: "gescheitert",
    },
    severity: { contradiction: "Widerspruch", tension: "Spannung" },
    pairs: "Bedingungspaare geprüft",
    compatible: "Die genannten Bedingungen sind miteinander vereinbar.",
  },
  en: {
    title: "Moderator's compromise proposal",
    passes: "carries with conditions",
    fails: "failed",
    components: "Components",
    conditions: "Conditions",
    support: "for",
    conditional: "conditional",
    oppose: "against",
    redLines: "Red lines touched",
    kind: {
      financing: "Financing",
      evaluation: "Evaluation",
      sunset: "Sunset",
      pilot: "Pilot",
      governance: "Responsibility",
      other: "Condition",
    },
    none: "No compromise proposal in this run.",
    consistency: "Experte consistency check",
    verdict: {
      carries: "carries",
      carries_if_reconciled: "carries only if the conditions can be reconciled",
      fails: "failed",
    },
    severity: { contradiction: "Contradiction", tension: "Tension" },
    pairs: "condition pairs checked",
    compatible: "The stated conditions are compatible with each other.",
  },
} as const;

/** Conflicting condition pairs as plain lines ("Sozialversicherung / Ärztekammer: ..."). */
export function consistencyLines(k: CompromiseConsistency, lang: Lang): string[] {
  const c = COMPROMISE_T[lang];
  return k.conflicts.map(
    (x) =>
      `${c.severity[x.severity]}: ${nameOf(x.a, lang)} / ${nameOf(x.b, lang)}: ${tx(x.note, lang)}`,
  );
}

/** One line: "trägt unter Bedingungen · 4 dafür, 3 bedingt, 2 dagegen". */
export function compromiseTally(
  r: CompromiseResult,
  lang: Lang,
  consistency?: CompromiseConsistency | null,
): string {
  const c = COMPROMISE_T[lang];
  const head =
    consistency && consistency.packageId === r.packageId
      ? c.verdict[consistency.verdict]
      : r.passes
        ? c.passes
        : c.fails;
  return `${head} · ${r.support.length} ${c.support}, ${r.conditional.length} ${c.conditional}, ${r.oppose.length} ${c.oppose}`;
}
