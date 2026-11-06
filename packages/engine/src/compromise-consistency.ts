// Experte consistency check after the ratification round. A compromise can "carry" on paper
// through conditional support whose conditions contradict each other (the payers demand
// reallocation, the medical chamber rejects fee cuts). The Experte pairs every stated
// condition and flags incompatible pairs; a carried package with contradictions then only
// carries if those conditions can be reconciled. Runs inline after the ratification and
// offline over recorded runs (compromise-cli.ts); the result is runs/<runId>.compromise.json.
import { writeFileSync } from "node:fs";
import path from "node:path";
import type {
  CompromiseConflict,
  CompromiseConsistency,
  CompromisePackage,
  CompromiseResult,
  CompromiseStatedCondition,
  CompromiseVote,
  LocalizedText,
} from "@sv/contracts";
import { catalogAgent } from "@sv/contracts";
import { z } from "zod";
import { L } from "./config.ts";
import { type CallMeta, type Message, structured } from "./llm.ts";

export const VERDICT_LABEL = {
  carries: L("trägt", "carries"),
  carries_if_reconciled: L(
    "trägt nur, wenn die Bedingungen vereinbar sind",
    "carries only if the conditions can be reconciled",
  ),
  fails: L("trägt nicht", "does not carry"),
} as const;

export const ConsistencyOut = z.object({
  pairs: z.array(
    z.object({
      pair: z.string(),
      verdict: z.enum(["compatible", "tension", "contradiction"]),
      noteDe: z.string(),
      noteEn: z.string(),
    }),
  ),
});
export type ConsistencyOut = z.infer<typeof ConsistencyOut>;

const tx = (t: LocalizedText, lang: "de" | "en") =>
  lang === "en" ? (t.translations?.en ?? t.text) : t.text;
const nameDe = (id: string) => catalogAgent(id)?.nameDe ?? id;

/** Conditions that carry the tally: conditional support, or support with a stated condition. */
export function statedConditions(votes: CompromiseVote[]): CompromiseStatedCondition[] {
  return votes
    .filter((v) => v.stance !== "oppose" && v.condition && v.condition.text.trim())
    .map((v) => ({
      agentId: v.agentId,
      stance: v.stance,
      condition: v.condition as LocalizedText,
    }));
}

export function pairsOf<T>(xs: T[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([i, j]);
  return out;
}

export function consistencyMessages(
  pkg: CompromisePackage,
  conds: CompromiseStatedCondition[],
): Message[] {
  const pairs = pairsOf(conds).map(([i, j]) => `B${i + 1}-B${j + 1}`);
  const user = [
    `Kompromisspaket: ${pkg.title.text}. ${pkg.rationale.text}`,
    `Bausteine: ${pkg.components.map((c, i) => `(${i + 1}) ${c.text.text}`).join(" ")}`,
    pkg.conditions.length
      ? `Bedingungen der Moderation: ${pkg.conditions.map((c) => c.text.text).join("; ")}`
      : "",
    "",
    "Bedingungen der Institutionen aus der Abschlussrunde:",
    ...conds.map((c, i) => `B${i + 1} (${nameDe(c.agentId)}, ${c.stance}): ${c.condition.text}`),
    "",
    `Prüfe jedes Paar: ${pairs.join(", ")}.`,
    "verdict: compatible = beide Bedingungen können im selben Paket gleichzeitig erfüllt werden; tension = beide sind nur mit einem ausdrücklichen Tausch oder einer zusätzlichen Finanzierung gleichzeitig erfüllbar; contradiction = die Erfüllung der einen schließt die andere aus (z. B. Umschichtung zulasten eines Budgets, das die andere Seite unangetastet lassen will; Honorarkürzung gegen Ausschluss jeder Honorarkürzung).",
    "Sei nüchtern: unterschiedliche Schwerpunkte sind compatible. Nur echte Unvereinbarkeit ist contradiction.",
    "noteDe/noteEn: ein kurzer Satz, worin der Konflikt besteht (bei compatible leer). Nur Institutionen, keine Personen. Kein Gedankenstrich-Zeichen.",
  ]
    .filter((x) => x !== "")
    .join("\n");
  return [
    {
      role: "system",
      content:
        "Du bist der Experte für Zahlen, Recht und Finanzierung im österreichischen Gesundheitswesen. Du prüfst, ob die Bedingungen, unter denen Institutionen einem Kompromiss zustimmen, miteinander vereinbar sind.",
    },
    { role: "user", content: user },
  ];
}

/** Maps the model's pair verdicts onto the conditions; unknown pair ids are ignored. */
export function toConsistency(
  runId: string,
  pkg: CompromisePackage,
  result: CompromiseResult | null,
  conds: CompromiseStatedCondition[],
  out: ConsistencyOut | null,
  model: string,
): CompromiseConsistency {
  const conflicts: CompromiseConflict[] = [];
  const seen = new Set<string>();
  for (const p of out?.pairs ?? []) {
    if (p.verdict === "compatible") continue;
    const m = /B(\d+)\s*[-/,]\s*B(\d+)/.exec(p.pair);
    if (!m) continue;
    const a = conds[Number(m[1]) - 1];
    const b = conds[Number(m[2]) - 1];
    if (!a || !b || a === b) continue;
    const key = [a.agentId, b.agentId].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    conflicts.push({
      a: a.agentId,
      b: b.agentId,
      severity: p.verdict,
      note: L(p.noteDe, p.noteEn || undefined),
    });
  }
  conflicts.sort((x, y) =>
    x.severity === y.severity ? 0 : x.severity === "contradiction" ? -1 : 1,
  );
  const passes = result?.passes ?? false;
  const verdict = !passes
    ? "fails"
    : conflicts.some((c) => c.severity === "contradiction")
      ? "carries_if_reconciled"
      : "carries";
  return {
    runId,
    packageId: pkg.id,
    verdict,
    label: VERDICT_LABEL[verdict],
    conditions: conds,
    pairsChecked: pairsOf(conds).length,
    conflicts,
    model,
    checkedAt: new Date().toISOString(),
  };
}

export async function checkCompromiseConsistency(
  runId: string,
  pkg: CompromisePackage,
  votes: CompromiseVote[],
  result: CompromiseResult | null,
  model: string,
): Promise<{ consistency: CompromiseConsistency; meta: CallMeta | null }> {
  const conds = statedConditions(votes);
  if (conds.length < 2)
    return { consistency: toConsistency(runId, pkg, result, conds, null, model), meta: null };
  const r = await structured(
    model,
    "compromise_consistency",
    ConsistencyOut,
    consistencyMessages(pkg, conds),
    { reasoningEffort: "low", maxOutputTokens: 6000 },
  );
  return { consistency: toConsistency(runId, pkg, result, conds, r.data, model), meta: r.meta };
}

export function consistencyNote(c: CompromiseConsistency): LocalizedText {
  const contra = c.conflicts.filter((x) => x.severity === "contradiction");
  if (c.verdict !== "carries_if_reconciled")
    return L(
      `Konsistenzprüfung: ${c.pairsChecked} Bedingungspaare geprüft, ${tx(c.label, "de")}.`,
      `Consistency check: ${c.pairsChecked} condition pairs checked, ${tx(c.label, "en")}.`,
    );
  const list = (lang: "de" | "en") =>
    contra
      .map((x) => `${lang === "de" ? nameDe(x.a) : x.a} / ${lang === "de" ? nameDe(x.b) : x.b}`)
      .join("; ");
  return L(
    `Konsistenzprüfung: Kompromiss ${tx(c.label, "de")}. Widersprüchliche Bedingungen: ${list("de")}.`,
    `Consistency check: compromise ${tx(c.label, "en")}. Conflicting conditions: ${list("en")}.`,
  );
}

/** Text guard shared with the run files: no dash glyphs in model text. */
const undash = (v: unknown): unknown =>
  typeof v === "string"
    ? v.replace(/\s[–—]\s/g, ", ").replace(/[–—]/g, "-")
    : Array.isArray(v)
      ? v.map(undash)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, undash(x)]))
        : v;

export function writeConsistencySidecar(dir: string, c: CompromiseConsistency): string {
  const file = path.join(dir, `${c.runId}.compromise.json`);
  writeFileSync(file, `${JSON.stringify(undash(c), null, 2)}\n`);
  return file;
}
