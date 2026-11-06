// Legal guardrail (FR-P6): which provisions of the imported legal basis a proposal touches,
// and whether it needs a change of the law or fits inside the existing instruments
// (Gesamtvertrag, RSG, Art. 15a agreement). Deterministic and pure, so the Experte note in the
// run record, the badge in the UI and the tests all give the same answer; no model call.
// Provisions are the law sources imported from RIS (kind "law", id law-<law>-<provision>).
import type { Proposal } from "@sv/contracts";
import { LEGAL_RULES, type LegalRule } from "./rules.ts";

export type LegalRef = {
  /** "ASVG § 342" */
  ref: string;
  /** Optional Absatz, "Abs. 1 Z 1". */
  detail?: string;
  /** Archive source id of the provision, "law-asvg-342". */
  sourceId: string;
  /** Rule that matched, for the trace. */
  rule: string;
  why: string;
};

export type LegalAssessment = {
  touches: LegalRef[];
  /** Provisions that would have to change; empty when the measure fits the current law. */
  changes: LegalRef[];
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Archive source id of a provision reference, "ASVG § 342" -> "law-asvg-342",
 * "15a-OF Art. 5" -> "law-15a-of-art-5". Mirrors lawSourceId in packages/db/src/legal/ris.ts
 * (kept apart so this module stays importable in the browser).
 */
export function lawSourceId(ref: string): string {
  const m = /^(\S+)\s+(.+)$/.exec(ref.trim());
  if (!m) return `law-${slug(ref)}`;
  const prov = (m[2] ?? "").replace(/\s+/g, " ");
  const art = /^Art(?:ikel|\.)?\s*(.+)$/i.exec(prov);
  return `law-${slug(m[1] ?? "")}-${slug(art ? `art-${art[1]}` : prov.replace(/^§\s*/, ""))}`;
}

/** All text of a proposal the rules look at: title, components, financing, both languages. */
export function proposalText(p: Pick<Proposal, "title" | "components" | "financing">): string {
  const parts = [p.title, ...(p.components ?? []), ...(p.financing ? [p.financing] : [])];
  return parts
    .flatMap((t) => [t.text, t.translations.de ?? "", t.translations.en ?? ""])
    .join(" \n ");
}

function refsOf(rule: LegalRule, list: LegalRule["touches"]): LegalRef[] {
  return list.map((r) => ({
    ref: r.ref,
    ...(r.detail ? { detail: r.detail } : {}),
    sourceId: lawSourceId(r.ref),
    rule: rule.id,
    why: rule.why,
  }));
}

function dedupe(refs: LegalRef[]): LegalRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => !seen.has(r.ref) && Boolean(seen.add(r.ref)));
}

/**
 * Assesses a proposal against the rule table. `known`, when given, is the set of imported law
 * source ids: references to provisions that are not in the corpus are dropped, so the note
 * never cites a provision the archive cannot open.
 */
export function assessLegal(
  p: Pick<Proposal, "title" | "components" | "financing">,
  known?: ReadonlySet<string>,
): LegalAssessment {
  const text = proposalText(p);
  const touches: LegalRef[] = [];
  const changes: LegalRef[] = [];
  for (const rule of LEGAL_RULES) {
    if (!rule.match.test(text)) continue;
    touches.push(...refsOf(rule, rule.touches));
    if (rule.change?.when.test(text)) changes.push(...refsOf(rule, rule.change.refs));
  }
  const keep = (r: LegalRef) => !known || known.has(r.sourceId);
  const ch = dedupe(changes.filter(keep));
  const changed = new Set(ch.map((r) => r.ref));
  return {
    touches: dedupe(touches.filter(keep)).filter((r) => !changed.has(r.ref)),
    changes: ch,
  };
}

const fmt = (r: LegalRef) => (r.detail ? `${r.ref} ${r.detail}` : r.ref);

/** The Experte note line: "Rechtsgrundlage: ... ; erfordert Änderung ASVG § 131". */
export function legalNote(a: LegalAssessment): { de: string; en: string } | null {
  if (!a.touches.length && !a.changes.length) return null;
  const all = [...a.changes, ...a.touches];
  const de = [
    `Rechtsgrundlage: ${all.map(fmt).join(", ")}`,
    a.changes.length
      ? `erfordert Änderung ${a.changes.map((r) => r.ref).join(", ")}`
      : "im geltenden Recht umsetzbar (Gesamtvertrag, RSG oder Vereinbarung)",
  ].join("; ");
  const en = [
    `Legal basis: ${all.map(fmt).join(", ")}`,
    a.changes.length
      ? `requires amending ${a.changes.map((r) => r.ref).join(", ")}`
      : "feasible under current law (collective contract, RSG or agreement)",
  ].join("; ");
  return { de, en };
}
