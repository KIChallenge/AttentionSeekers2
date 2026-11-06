// Legal guardrail hook (FR-P6). The runner calls legalNotesFor() once per batch of changed
// proposals; each proposal gets one Experte note the first time it appears, so the run
// record states which provisions it touches and whether it needs a change of the law.
import type { LocalizedText, Proposal } from "@sv/contracts";
import { assessLegal, legalNote } from "./guardrail.ts";

export {
  assessLegal,
  type LegalAssessment,
  type LegalRef,
  lawSourceId,
  legalNote,
} from "./guardrail.ts";
export { lawBranchQuery, lawRecencyWeight } from "./retrieval.ts";

const noted = new WeakMap<object, Set<string>>();

export type LegalExpertNote = {
  utteranceIds: string[];
  note: LocalizedText;
  resolution: "unresolved";
};

/** Experte notes for proposals not yet assessed in this run (`run` is the run state object). */
export function legalNotesFor(
  run: object,
  proposals: Proposal[],
  utteranceId: string,
): LegalExpertNote[] {
  const seen = noted.get(run) ?? new Set<string>();
  noted.set(run, seen);
  const out: LegalExpertNote[] = [];
  for (const p of proposals) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const n = legalNote(assessLegal(p));
    if (!n) continue;
    const title = p.title.text;
    out.push({
      utteranceIds: [utteranceId],
      note: {
        lang: "de",
        text: `${p.id} "${title}": ${n.de}.`,
        translations: { en: `${p.id} "${p.title.translations.en ?? title}": ${n.en}.` },
      },
      resolution: "unresolved",
    });
  }
  return out;
}
