import { describe, expect, it } from "vitest";
import { pageToText, parseTsv } from "./ocr";
import { TSV } from "./ocr-fixture";

describe("parseTsv", () => {
  it("reads page size, nests words and recomputes boxes from kept words", () => {
    const page = parseTsv(TSV, 7);
    expect(page.width).toBe(1240);
    expect(page.height).toBe(1755);
    expect(page.blocks).toHaveLength(2);
    expect(page.dropped).toBe(1);
    expect(page.wordCount).toBe(16);
    const [b1] = page.blocks;
    expect(b1.paragraphs[0].lines).toHaveLength(2);
    expect(b1.paragraphs[0].lines[0].words.map((w) => w.text)).toEqual(["Tiroler", "Tageszeitung"]);
    // The dropped speckle at x=50 does not widen the second line.
    expect(b1.paragraphs[0].lines[1].box).toEqual([140, 90, 80, 20]);
    expect(b1.box).toEqual([50, 50, 170, 60]);
    expect(b1.paragraphs[0].lines[1].words[0].conf).toBe(88.1);
  });

  it("joins lines with newlines and blocks with blank lines", () => {
    const page = parseTsv(TSV, 7);
    expect(pageToText(page)).toBe(
      "Tiroler Tageszeitung\nHeimkosten\n\nÄrztekammer fordert mehr\nKassenstellen für Landärzte und Honorare\nVersorgung im ländlichen Raum sichern",
    );
    expect(pageToText(page, new Set(["1"]))).toBe("Tiroler Tageszeitung\nHeimkosten");
  });

  it("rejects files without the tesseract columns", () => {
    expect(() => parseTsv("a\tb\n1\t2", 1)).toThrow();
  });
});
