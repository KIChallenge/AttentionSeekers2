import { describe, expect, it } from "vitest";
import {
  citationStyleLine,
  citationStyleOf,
  isSubstantive,
  markersOf,
  tierOf,
} from "../src/citation-style.ts";

describe("citation style", () => {
  it("detects legal, figure and study markers", () => {
    expect(markersOf("Gemäß § 23 Abs. 2 ASVG ist das nicht vorgesehen.").legal).toBe(true);
    expect(markersOf("Das kostet rund 120 Mio. Euro pro Jahr.").figures).toBe(true);
    expect(markersOf("Laut Rechnungshof fehlt eine Steuerung.").studies).toBe(true);
    const none = markersOf(
      "Wir lehnen diesen Vorschlag entschieden ab, er gefährdet die Versorgung.",
    );
    expect(none.legal || none.figures || none.studies).toBe(false);
  });

  it("skips boilerplate segments", () => {
    expect(isSubstantive("zu richten.")).toBe(false);
    expect(
      isSubstantive("Die Kammer begrüßt grundsätzlich das Ziel der vorliegenden Novelle."),
    ).toBe(true);
  });

  it("assigns tertile tiers", () => {
    const panel = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    expect(tierOf(0.6, panel)).toBe("high");
    expect(tierOf(0.1, panel)).toBe("low");
    expect(tierOf(0.35, panel)).toBe("medium");
  });

  it("phrases the hint by tier without forcing citations", () => {
    for (const id of ["ph", "fm", "nr"]) {
      const st = citationStyleOf(id);
      expect(st).not.toBeNull();
      const line = citationStyleLine(id);
      expect(line).toContain("keine Pflicht");
    }
    expect(citationStyleLine("ph")).toContain("Paragraphen, Zahlen");
    expect(citationStyleLine("fm")).toContain("eher aus Interessen");
  });
});
