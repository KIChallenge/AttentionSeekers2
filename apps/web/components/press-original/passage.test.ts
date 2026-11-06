import { describe, expect, it } from "vitest";
import { parseTsv } from "./ocr";
import { TSV } from "./ocr-fixture";
import { matchPassage, tokens } from "./passage";

describe("tokens", () => {
  it("drops stop words and short tokens and stems inflections", () => {
    expect(tokens("Die Ärztekammer fordert mehr Kassenstellen für die Landärzte")).toEqual([
      "ärztekamm",
      "fordert",
      "kassenstell",
      "landärzt",
    ]);
  });
});

describe("matchPassage", () => {
  it("picks the block that shares the institution and the key terms", () => {
    const page = parseTsv(TSV, 7);
    const m = matchPassage(
      page,
      "Die Kammer fordert zusätzliche Kassenstellen für Landärzte und bessere Honorare, um die Versorgung zu sichern.",
      "Ärztekammer",
    );
    expect(m).not.toBeNull();
    expect(m?.blockIds).toEqual(["2"]);
    expect(m?.matched).toEqual(
      expect.arrayContaining(["Ärztekammer", "Kassenstellen", "Landärzte", "Honorare"]),
    );
  });

  it("returns null when the paraphrase shares nothing with the page", () => {
    const page = parseTsv(TSV, 7);
    expect(matchPassage(page, "Pflegegeld Reform Budget Finanzausgleich", "Pflege")).toBeNull();
  });
});
