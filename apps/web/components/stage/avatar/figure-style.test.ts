import { describe, expect, it } from "vitest";
import { castGender } from "@/lib/stage-cast";
import { isFigureKind, REALISTIC_ASSETS, realisticAssets, realisticStyle } from "./figure-style";

const SEATS = ["moderator", "expert", "gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm"];

describe("realistic figures", () => {
  it("picks a character of the seat's cast gender", () => {
    const assets = realisticAssets(SEATS);
    for (const id of SEATS) {
      expect(REALISTIC_ASSETS[castGender(id)]).toContain(assets.get(id));
    }
  });

  it("spreads seats of one gender over the characters", () => {
    const assets = realisticAssets(SEATS);
    const female = SEATS.filter((id) => castGender(id) === "female").map((id) => assets.get(id));
    expect(new Set(female).size).toBe(Math.min(female.length, REALISTIC_ASSETS.female.length));
  });

  it("is stable across calls and keeps the institution colour", () => {
    expect(realisticAssets(SEATS)).toEqual(realisticAssets(SEATS));
    const st = realisticStyle("gm", "#123456");
    expect(st.suit).toBe("#123456");
    expect(st.glasses).toBe(false);
    expect(st).toEqual(realisticStyle("gm", "#123456"));
  });

  it("accepts only the two figure kinds", () => {
    expect(isFigureKind("realistic")).toBe(true);
    expect(isFigureKind("stylized")).toBe(true);
    expect(isFigureKind("photo")).toBe(false);
    expect(isFigureKind(null)).toBe(false);
  });
});
