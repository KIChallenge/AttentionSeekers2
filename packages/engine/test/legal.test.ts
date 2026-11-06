import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LocalizedText, Proposal } from "@sv/contracts";
import { lawSourceId as dbLawSourceId } from "@sv/db/legal/ris";
import { describe, expect, it } from "vitest";
import { assessLegal, lawSourceId, legalNote, legalNotesFor } from "../src/legal/index.ts";
import { LEGAL_RULES } from "../src/legal/rules.ts";
import { fuse, type Row } from "../src/retrieval.ts";

const L = (text: string): LocalizedText => ({ lang: "de", text, translations: {} });
const proposal = (id: string, title: string, extra: Partial<Proposal> = {}): Proposal => ({
  id,
  originAgent: "sv",
  round: 1,
  topicIds: [],
  title: L(title),
  cost: null,
  acceptance: 0.5,
  feasibility: 0.5,
  supporters: [],
  opponents: [],
  conditional: [],
  status: "open",
  rejectionReason: null,
  outcomeClass: null,
  alternativeTo: null,
  ...extra,
});

describe("legal guardrail", () => {
  it("flags a statutory change when the measure leaves the Gesamtvertrag", () => {
    const a = assessLegal(proposal("p1", "Wahlarzt-Kostenerstattung schrittweise abschaffen"));
    expect(a.changes.map((r) => r.ref)).toEqual(["ASVG § 131"]);
    expect(legalNote(a)?.de).toContain("erfordert Änderung ASVG § 131");
  });
  it("states the basis without a change for a Stellenplan expansion", () => {
    const a = assessLegal(proposal("p2", "100 zusätzliche Kassenstellen im Stellenplan 2027"));
    expect(a.changes).toEqual([]);
    expect(a.touches.map((r) => r.ref)).toContain("ASVG § 342");
    expect(legalNote(a)?.de).toMatch(
      /^Rechtsgrundlage: ASVG § 342 Abs\. 1 Z 1.*im geltenden Recht umsetzbar/,
    );
  });
  it("reads components and financing, not only the title", () => {
    const a = assessLegal(
      proposal("p3", "Versorgungspaket Wartezeiten", {
        components: [L("Diplomierte Pflege darf Heilbehelfe eigenständig verordnen")],
      }),
    );
    expect(a.changes.map((r) => r.ref)).toContain("GuKG § 15a");
  });
  it("is silent on proposals no rule covers", () => {
    expect(legalNote(assessLegal(proposal("p4", "Mehr Transparenz im Jahresbericht")))).toBeNull();
  });
  it("drops provisions that are not in the imported corpus", () => {
    const a = assessLegal(proposal("p1", "Wahlarzt-Kostenerstattung abschaffen"), new Set());
    expect(a.touches).toEqual([]);
    expect(a.changes).toEqual([]);
  });
  it("uses the importer's source ids", () => {
    expect(lawSourceId("ASVG § 342")).toBe(dbLawSourceId("ASVG", "§ 342"));
    expect(lawSourceId("ÄrzteG § 49")).toBe(dbLawSourceId("ÄrzteG", "§ 49"));
    expect(lawSourceId("15a-OF Art. 1")).toBe(dbLawSourceId("15a-OF", "Art. 1"));
  });
  it("cites only provisions that exist in the imported legal basis", () => {
    const file = path.resolve(import.meta.dirname, "../../../data/derived/law_sources.jsonl");
    if (!existsSync(file)) return;
    const ids = new Set(
      readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as { id: string }).id),
    );
    const refs = LEGAL_RULES.flatMap((r) => [...r.touches, ...(r.change?.refs ?? [])]);
    for (const r of refs) expect(ids, r.ref).toContain(lawSourceId(r.ref));
  });
});

describe("Experte hook", () => {
  it("notes each proposal once per run", () => {
    const run = {};
    const p = proposal("p1", "Wahlarzt-Kostenerstattung abschaffen");
    const first = legalNotesFor(run, [p], "u2-03");
    expect(first).toHaveLength(1);
    expect(first[0]?.note.text).toContain('p1 "Wahlarzt-Kostenerstattung abschaffen"');
    expect(first[0]?.utteranceIds).toEqual(["u2-03"]);
    expect(legalNotesFor(run, [p], "u3-01")).toEqual([]);
    expect(legalNotesFor({}, [p], "u3-01")).toHaveLength(1);
  });
});

describe("law branch in the fusion", () => {
  const row = (id: string, kind: string, date: string): Row => ({
    segment_id: id,
    source_id: id.split("#")[0] ?? id,
    text: "x",
    date,
    institution_code: "x",
    institution_role: "other",
    kind,
    title: null,
    outlet: null,
    corpus_revision: "r",
    rank: 1,
  });
  it("keeps statutes in force at full weight and applies the as-of predicate", () => {
    const out = fuse({
      lexical: [],
      law: [row("law-primvg-2#1", "law", "2017-08-02"), row("law-asvg-342#1", "law", "2027-01-01")],
      asOf: "2026-11-06",
      role: "social_insurance",
    });
    expect(out.map((s) => s.r.segment_id)).toEqual(["law-primvg-2#1"]);
    expect(out[0]?.w).toBe(1);
  });
});
