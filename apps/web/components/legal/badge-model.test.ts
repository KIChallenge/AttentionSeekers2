import type { LocalizedText } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { legalBadgeModel } from "./badge-model";

const L = (text: string, en?: string): LocalizedText => ({
  lang: "de",
  text,
  translations: en ? { en } : {},
});

describe("legal badge", () => {
  it("warns when the proposal needs a change of the law", () => {
    const m = legalBadgeModel({ title: L("Wahlarzt-Kostenerstattung abschaffen") }, "de");
    expect(m?.kind).toBe("change");
    expect(m?.label).toBe("erfordert Änderung ASVG § 131");
    expect(m?.href).toBe("/archive/sources/law-asvg-131");
  });
  it("shows the legal basis quietly when current law suffices", () => {
    const m = legalBadgeModel({ title: L("Zusätzliche Kassenstellen im Stellenplan") }, "de");
    expect(m?.kind).toBe("basis");
    expect(m?.label).toBe("Rechtsgrundlage ASVG § 342 +1");
    expect(m?.title).toContain("ASVG § 343 Abs. 1");
  });
  it("speaks English and stays hidden without a matching rule", () => {
    expect(legalBadgeModel({ title: L("Wahlarzt-Kostenerstattung abschaffen") }, "en")?.label).toBe(
      "requires amending ASVG § 131",
    );
    expect(legalBadgeModel({ title: L("Jahresbericht veröffentlichen") }, "de")).toBeNull();
  });
});
