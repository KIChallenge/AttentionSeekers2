import { afterEach, describe, expect, it } from "vitest";
import { profileOf, redLinesOf, setActiveTemplate, templateSeed } from "../src/config.ts";

describe("template profile overrides (SV-OG 2018 backtest)", () => {
  afterEach(() => setActiveTemplate(null));

  it("replaces the 2026 profile only while the template is active", () => {
    expect(profileOf("sv").unit).toBe("Dachverband und ÖGK");
    expect(redLinesOf("ak").length).toBeGreaterThan(0);
    setActiveTemplate("backtest_svog_2018");
    expect(profileOf("sv").unit).toBe("Hauptverband und Gebietskrankenkassen");
    expect(profileOf("sv").vetoStatus).toBe("consultative");
    expect(profileOf("nr").vetoStatus).toBe("formal_veto");
    expect(redLinesOf("ak")).toEqual([]);
    expect(profileOf("sv").delegates?.map((d) => d.id)).toEqual(["sv-lead", "sv-dg", "sv-dn"]);
    setActiveTemplate("wartezeiten");
    expect(profileOf("sv").unit).toBe("Dachverband und ÖGK");
  });

  it("seeds the government quorum and keeps post-2018 names out of the profiles", () => {
    const seed = templateSeed("backtest_svog_2018");
    expect(seed?.qualifiedMajority).toEqual({ needed: 1, of: 3 });
    expect(JSON.stringify(seed?.profiles)).not.toMatch(/ÖGK|Gesundheitskasse/);
  });
});
