import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fileResponse, RUN_ID, UTT_ID } from "./stage-voice";
import { costMultiplier, elevenRequest, loadVoiceTable } from "./tts-providers";

const voice = { id: "v", name: "n", category: "premade", speed: 0.97 };

describe("elevenRequest", () => {
  it("sends one utterance without stitching and pins German on v2.5", () => {
    const b = elevenRequest("eleven_turbo_v2_5", voice, "Guten Tag.", "de");
    expect(b).toMatchObject({
      text: "Guten Tag.",
      model_id: "eleven_turbo_v2_5",
      language_code: "de",
    });
    expect(b.voice_settings).toMatchObject({ stability: 0.5, similarity_boost: 0.75, speed: 0.97 });
    for (const k of ["previous_text", "next_text", "previous_request_ids", "next_request_ids"]) {
      expect(b).not.toHaveProperty(k);
    }
    expect(b.voice_settings).not.toHaveProperty("style");
  });

  it("keeps style and speaker boost for multilingual v2 only", () => {
    const b = elevenRequest("eleven_multilingual_v2", voice, "x", "de");
    expect(b).not.toHaveProperty("language_code");
    expect(b.voice_settings).toMatchObject({ style: 0.15, use_speaker_boost: true });
  });

  it("bills turbo and flash at half a credit per character", () => {
    expect(costMultiplier("eleven_turbo_v2_5")).toBe(0.5);
    expect(costMultiplier("eleven_flash_v2_5")).toBe(0.5);
    expect(costMultiplier("eleven_multilingual_v2")).toBe(1);
  });
});

describe("voice table", () => {
  it("has a distinct voice for each of the eleven stage speakers", () => {
    const t = loadVoiceTable(path.resolve(import.meta.dirname, ".."), {});
    const speakers = ["moderator", "gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm", "expert"];
    expect(Object.keys(t.voices).sort()).toEqual([...speakers].sort());
    expect(new Set(Object.values(t.voices).map((v) => v.id)).size).toBe(11);
  });
});

describe("ids", () => {
  it("accepts run and utterance ids and rejects paths", () => {
    expect(RUN_ID.test("reference-wartezeiten-presse")).toBe(true);
    expect(UTT_ID.test("u2-10")).toBe(true);
    for (const bad of ["../x", "a/b", "a.b", "", "u 1", "%2e%2e"]) {
      expect(RUN_ID.test(bad) && UTT_ID.test(bad)).toBe(false);
    }
  });
});

describe("fileResponse", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sv-voice-"));
  const file = path.join(dir, "a.mp3");
  writeFileSync(file, Buffer.from("0123456789"));
  const req = (range?: string) =>
    new Request("http://x/a", range ? { headers: { range } } : undefined);

  it("serves the whole file with its provider header", async () => {
    const r = fileResponse(req(), file, { "X-Voice-Provider": "elevenlabs" });
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Voice-Provider")).toBe("elevenlabs");
    expect(await r.text()).toBe("0123456789");
  });

  it("answers byte ranges for seeking", async () => {
    const r = fileResponse(req("bytes=2-4"), file, {});
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Range")).toBe("bytes 2-4/10");
    expect(await r.text()).toBe("234");
    expect(await fileResponse(req("bytes=7-"), file, {}).text()).toBe("789");
    expect(await fileResponse(req("bytes=-3"), file, {}).text()).toBe("789");
    expect(fileResponse(req("bytes=20-"), file, {}).status).toBe(416);
  });
});
