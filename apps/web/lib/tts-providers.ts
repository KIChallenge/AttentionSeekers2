// Voice providers for the stage, shared by the offline script (scripts/stage-tts.ts) and the
// per-utterance route (app/api/runs/[runId]/tts/[uttId]). Plain fetch and node:fs only, no
// path aliases, so plain `node` can import it too. Server-only: it handles API keys.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AZURE_GENDER, CAST, castGender } from "./stage-cast.ts";

/** Repo .env merged with process.env; non-empty process values win (see stage-tts.ts). */
export function loadEnv(repoRoot: string): Record<string, string> {
  const file = path.join(repoRoot, ".env");
  const out: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1]) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (v) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------------- Azure

export interface AzureVoice {
  voice: string;
  rate: string;
}

/** Azure neural voice and prosody rate per speaker and language, from lib/stage-cast.ts. */
export const AZURE_VOICES: Record<string, Record<string, AzureVoice>> = {
  de: Object.fromEntries(Object.entries(CAST).map(([k, c]) => [k, c.azure.de])),
  en: Object.fromEntries(Object.entries(CAST).map(([k, c]) => [k, c.azure.en])),
};
export const AZURE_LOCALE: Record<string, string[]> = {
  de: ["de-AT", "de-CH", "de-DE"],
  en: ["en-GB"],
};

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Checks the configured voices against the region's list; unknown ones get an unused spare. */
export async function azureVoiceTable(
  region: string,
  key: string,
  lang: string,
  speakers: string[],
): Promise<Record<string, AzureVoice>> {
  const r = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
    { headers: { "Ocp-Apim-Subscription-Key": key } },
  );
  if (!r.ok) throw new Error(`Azure Speech voices/list ${r.status} in ${region}`);
  const all = (await r.json()) as Array<{ ShortName: string; Locale: string }>;
  const locales = AZURE_LOCALE[lang] ?? [];
  const available = all.filter((v) => locales.includes(v.Locale)).map((v) => v.ShortName);
  if (available.length === 0) throw new Error(`no ${lang} voice in ${region}`);
  return pickAzureVoices(available, lang, speakers);
}

/**
 * The cast's voice per speaker. A voice another speaker already holds (or one the region lacks)
 * is swapped for an unused voice of the same gender and only shared when none is left, so a
 * seat never speaks with a voice of the other gender.
 */
export function pickAzureVoices(
  available: string[],
  lang: string,
  speakers: string[],
): Record<string, AzureVoice> {
  const wanted = AZURE_VOICES[lang] ?? {};
  const used = new Set<string>();
  const table: Record<string, AzureVoice> = {};
  for (const sp of speakers) {
    const w = wanted[sp];
    if (w && available.includes(w.voice) && !used.has(w.voice)) {
      table[sp] = w;
      used.add(w.voice);
    }
  }
  for (const sp of speakers) {
    if (table[sp]) continue;
    const g = castGender(sp);
    const same = available.filter((v) => AZURE_GENDER[v] === g);
    const w = wanted[sp];
    const spare =
      same.find((v) => !used.has(v)) ??
      (w && available.includes(w.voice) ? w.voice : undefined) ??
      same[0];
    if (!spare) throw new Error(`no ${g} ${lang} voice available`);
    used.add(spare);
    table[sp] = { voice: spare, rate: w?.voice === spare ? w.rate : "+0%" };
  }
  return table;
}

export async function azureSynth(
  region: string,
  key: string,
  v: AzureVoice,
  text: string,
): Promise<Buffer> {
  const locale = v.voice.split("-").slice(0, 2).join("-");
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${v.voice}"><prosody rate="${v.rate}">${xml(text)}</prosody></voice></speak>`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "sv-stage-tts",
      },
      body: ssml,
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status !== 429 && r.status < 500) {
      throw new Error(`Azure Speech ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
  throw new Error("Azure Speech: retries exhausted");
}

// ----------------------------------------------------------------------------- ElevenLabs

export const EL_API = "https://api.elevenlabs.io/v1";
export const ELEVEN_ATTRIBUTION =
  "Stimmen: ElevenLabs (elevenlabs.io), Free-Tarif, nicht kommerziell. Übrige Wortmeldungen: Azure AI Speech.";

export interface ElevenVoice {
  id: string;
  name: string;
  /** premade on the free tier; professional or high_quality library voices after an upgrade */
  category: string;
  locale?: string;
  speed: number;
  /** Voice gender; must match the seat's gender in lib/stage-cast.ts (checked by a test). */
  gender?: string;
}

export interface VoiceTable {
  source: "premade" | "library";
  note?: string;
  /** Model for live per-utterance rendering; the offline script may override it. */
  model: string;
  voices: Record<string, ElevenVoice>;
}

/** The committed voice table (lib/stage-voices.json), or STAGE_VOICES_FILE if set. */
export function loadVoiceTable(webRoot: string, env: Record<string, string | undefined>) {
  const file = env.STAGE_VOICES_FILE
    ? path.resolve(webRoot, env.STAGE_VOICES_FILE)
    : path.join(webRoot, "lib", "stage-voices.json");
  return JSON.parse(readFileSync(file, "utf8")) as VoiceTable;
}

/** Credits per character (turbo, flash and v4 turbo bill half, per /v1/models). */
export function costMultiplier(model: string): number {
  return /turbo|flash/.test(model) ? 0.5 : 1;
}

export interface ElevenQuota {
  used: number;
  limit: number;
  tier: string;
  resetUnix: number | null;
}

export async function elevenQuota(key: string): Promise<ElevenQuota> {
  const r = await fetch(`${EL_API}/user/subscription`, { headers: { "xi-api-key": key } });
  if (!r.ok) throw new Error(`ElevenLabs subscription ${r.status}`);
  const d = (await r.json()) as {
    character_count: number;
    character_limit: number;
    tier: string;
    next_character_count_reset_unix?: number;
  };
  return {
    used: d.character_count,
    limit: d.character_limit,
    tier: d.tier,
    resetUnix: d.next_character_count_reset_unix ?? null,
  };
}

/**
 * One utterance, one request: no previous_text/next_text or request ids (stitching off).
 * Calm negotiation register: steady but not flat, close to the voice. `style` only where the
 * model supports it; `language_code` pins German on the v2.5 models.
 */
export function elevenRequest(model: string, v: ElevenVoice, text: string, lang: string) {
  const v2 = model === "eleven_multilingual_v2";
  return {
    text,
    model_id: model,
    ...(/_v2_5$/.test(model) ? { language_code: lang } : {}),
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      ...(v2 ? { style: 0.15, use_speaker_boost: true } : {}),
      speed: v.speed,
    },
  };
}

/** POST to the streaming endpoint; resolves once headers arrive, throws on a non-2xx status. */
export async function elevenStream(
  key: string,
  model: string,
  v: ElevenVoice,
  text: string,
  lang: string,
  signal?: AbortSignal,
): Promise<Response> {
  const r = await fetch(
    `${EL_API}/text-to-speech/${encodeURIComponent(v.id)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(elevenRequest(model, v, text, lang)),
      signal,
    },
  );
  if (!r.ok || !r.body) {
    throw new Error(`ElevenLabs ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  }
  return r;
}

/** Whole file in one buffer; one retry on 429 (free-tier concurrency). */
export async function elevenSynth(
  key: string,
  model: string,
  v: ElevenVoice,
  text: string,
  lang: string,
): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await elevenStream(key, model, v, text, lang);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt > 0 || !(e instanceof Error) || !e.message.startsWith("ElevenLabs 429")) throw e;
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}

// ------------------------------------------------------------------------------ manifests

export interface ManifestFile {
  runId: string;
  lang: string;
  model: string;
  voices: Record<string, string>;
  files: Record<string, string>;
  provider?: "azure" | "elevenlabs";
  attribution?: string;
}

export function readManifest(file: string): ManifestFile | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ManifestFile;
  } catch {
    return null;
  }
}

/** Write to a temp file next to the target, then rename: readers never see half a manifest. */
export function writeFileAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

export function writeManifest(file: string, m: ManifestFile) {
  writeFileAtomic(file, `${JSON.stringify(m, null, 2)}\n`);
}
