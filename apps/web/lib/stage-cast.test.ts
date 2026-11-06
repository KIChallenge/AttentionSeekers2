import path from "node:path";
import { AGENT_CATALOG } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { figureStyle } from "@/components/stage/avatar/figure-style";
import { AZURE_GENDER, CAST, castGender, ELEVEN_PREMADE } from "./stage-cast";
import { AZURE_VOICES, loadVoiceTable, pickAzureVoices } from "./tts-providers";

const seats = Object.keys(CAST);
const table = loadVoiceTable(path.resolve(import.meta.dirname, ".."), {});

describe("stage cast: one gender per seat", () => {
  it.each(seats)("%s looks and sounds the same gender", (id) => {
    const g = CAST[id]?.gender;
    const look = figureStyle(id, "#336699");
    expect(look.gender).toBe(g);
    expect(look.hairCut).toBe(g === "female" ? "long" : "short");

    const el = CAST[id]?.eleven;
    if (el) {
      expect(ELEVEN_PREMADE[el]?.gender).toBe(g);
      // the committed table the route and the script read
      expect(table.voices[id]?.id).toBe(el);
      expect(table.voices[id]?.gender).toBe(g);
    } else {
      expect(table.voices[id]).toBeUndefined();
    }
    for (const lang of ["de", "en"]) {
      const v = AZURE_VOICES[lang]?.[id]?.voice ?? "";
      expect(AZURE_GENDER[v], `${id} ${lang} ${v}`).toBe(g);
    }
  });

  it("covers every speaker the voice table knows, and every catalog institution", () => {
    for (const id of Object.keys(table.voices)) expect(seats).toContain(id);
    for (const a of AGENT_CATALOG) expect(seats).toContain(a.id);
  });

  it("keeps a mix of about half and half", () => {
    const female = seats.filter((id) => castGender(id) === "female").length;
    expect(female / seats.length).toBeGreaterThan(0.4);
    expect(female / seats.length).toBeLessThan(0.6);
    const core = ["moderator", "expert", "gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm"];
    const coreFemale = core.filter((id) => castGender(id) === "female").length;
    expect(coreFemale).toBeGreaterThanOrEqual(5);
    expect(coreFemale).toBeLessThanOrEqual(6);
  });

  it("gives each seat its own ElevenLabs voice", () => {
    const ids = seats.map((id) => CAST[id]?.eleven).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never swaps a seat to a voice of the other gender when voices run short", () => {
    for (const lang of ["de", "en"]) {
      const available = Object.keys(AZURE_GENDER).filter((v) =>
        lang === "de" ? v.startsWith("de-") : v.startsWith("en-"),
      );
      const t = pickAzureVoices(available, lang, seats);
      for (const id of seats) expect(AZURE_GENDER[t[id]?.voice ?? ""]).toBe(castGender(id));
      // a region without the wanted voice still yields a same-gender one
      const short = available.filter((v) => v !== AZURE_VOICES[lang]?.pv?.voice);
      expect(AZURE_GENDER[pickAzureVoices(short, lang, ["pv"]).pv?.voice ?? ""]).toBe("female");
    }
  });
});
