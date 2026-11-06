import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentConfigOf } from "../src/config.ts";
import { findPersonNames } from "../src/guard.ts";
import { DOSSIER_DIR, personaBlock, personaMode, personaOf } from "../src/persona/index.ts";

const files = readdirSync(DOSSIER_DIR).filter((f) => f.endsWith(".md"));

describe("persona dossiers", () => {
  it("covers the nine adapter institutions", () => {
    for (const r of [
      "laender",
      "social_insurance",
      "chamber_labour",
      "nursing",
      "hospitals",
      "ministry_finance",
      "chamber_commerce",
      "medical_chamber",
      "patients",
    ])
      expect(files).toContain(`${r}.md`);
  });

  it("is person-free by the engine guard and has no em dash (CON-1/CON-2, fail closed)", () => {
    for (const f of files) {
      const text = readFileSync(path.join(DOSSIER_DIR, f), "utf8");
      expect(findPersonNames(text), f).toEqual([]);
      expect(text.includes(String.fromCharCode(0x2014)), f).toBe(false);
    }
  });

  it("switches by SV_PERSONA_MODE and falls back to profile without a dossier", () => {
    expect(personaMode({ SV_PERSONA_MODE: "profile" })).toBe("profile");
    expect(personaMode({ SV_PERSONA_MODE: "dossier" })).toBe("dossier");
    expect(personaBlock("sv", "profile")).toBe("");
    const block = personaBlock("sv", "dossier");
    expect(block).toContain("Persona-Dossier");
    expect(block).toContain("Haltung nach Thema");
    const info = personaOf("sv", "dossier");
    expect(info.mode).toBe("dossier");
    expect(info.version).toMatch(/^dossier-v\d+$/);
    expect(info.sha256).toMatch(/^[0-9a-f]{16}$/);
    // legislature has no dossier: profile, recorded as such
    expect(personaOf("nr", "dossier")).toEqual({ mode: "profile", version: null, sha256: null });
  });

  it("records the persona on the agent config snapshot", () => {
    expect(agentConfigOf("sv").persona?.mode).toBe(personaMode());
  });
});
