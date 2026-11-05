// The stage cast: one entry per speaker seat, and the single source of truth for how a seat is
// presented. The presentation gender drives the 3D figure (body pose set, hair), the Azure
// voices (de and en) and the ElevenLabs voice; a test fails if any of them disagree. Pure
// data, no imports, so plain `node` scripts, server code and client components can all use it.
//
// Seats stand for institutions, never for persons (CON-1, CON-2): the gender is a casting
// choice for a recognisable mix at the table (about half and half), not a claim about anyone.
// All voices are stock synthetic voices; the ElevenLabs ones are premade (the free tier allows
// nothing else), the German-verified ones on the core seats.

export type CastGender = "female" | "male";

export interface AzureCast {
  voice: string;
  rate: string;
}

export interface CastEntry {
  gender: CastGender;
  /** ElevenLabs premade voice id, or null: that seat is voiced by Azure only. */
  eleven: string | null;
  /** Speaking speed for ElevenLabs. */
  speed: number;
  azure: { de: AzureCast; en: AzureCast };
}

/** ElevenLabs premade voices on every account (GET /v2/voices, 2026-11-06). */
export interface PremadeVoice {
  name: string;
  gender: CastGender | "neutral";
  /** Listed with verified_languages de; the others speak German via the multilingual models. */
  germanVerified: boolean;
}
const el = (name: string, gender: PremadeVoice["gender"], germanVerified: boolean) => ({
  name,
  gender,
  germanVerified,
});

export const ELEVEN_PREMADE: Record<string, PremadeVoice> = {
  XrExE9yKIg1WjnnlVkGX: el("Matilda", "female", true),
  pFZP5JQG7iQjIQuC4Bku: el("Lily", "female", true),
  FGY2WhTYpPnrIDTdsKH5: el("Laura", "female", true),
  cgSgspJ2msm6clMCkdW9: el("Jessica", "female", true),
  EXAVITQu4vr4xnSDxMaL: el("Sarah", "female", false),
  Xb7hH8MSUJpSbSDYk0k2: el("Alice", "female", false),
  hpp4J3VqNfWAUOO0d1Us: el("Bella", "female", false),
  onwK4e9ZLuTAKqWW03F9: el("Daniel", "male", true),
  pqHfZKP75CvOlQylNhV4: el("Bill", "male", true),
  cjVigY5qzO86Huf0OWal: el("Eric", "male", true),
  CwhRBWXzGAHq8TQ4Fs17: el("Roger", "male", true),
  nPczCjzI2devNBz1zQrb: el("Brian", "male", true),
  bIHbv24MWmeRgasZH58o: el("Will", "male", true),
  TX3LPaxmHKxFdv7VOQHJ: el("Liam", "male", true),
  JBFqnCBsd6RMkjVDRZzb: el("George", "male", false),
  iP95p4xoKVk53GoZ742B: el("Chris", "male", false),
  pNInz6obpgDQGcFmaJgB: el("Adam", "male", false),
  IKne3meq5aSn9XLyUdCD: el("Charlie", "male", false),
  N2lVS1w4EtoT3dr4eOWO: el("Callum", "male", false),
  SOYHLrjzK2X1ezoPC6cr: el("Harry", "male", false),
  SAz9YHcvj6GT2YYXdXww: el("River", "neutral", false),
};

/** Gender of the Azure neural voices the stage may use (voices/list, germanywestcentral). */
export const AZURE_GENDER: Record<string, CastGender> = {
  "de-AT-IngridNeural": "female",
  "de-AT-JonasNeural": "male",
  "de-CH-LeniNeural": "female",
  "de-CH-JanNeural": "male",
  "de-DE-SeraphinaMultilingualNeural": "female",
  "de-DE-FlorianMultilingualNeural": "male",
  "de-DE-KatjaNeural": "female",
  "de-DE-ConradNeural": "male",
  "de-DE-AmalaNeural": "female",
  "de-DE-BerndNeural": "male",
  "de-DE-ChristophNeural": "male",
  "de-DE-ElkeNeural": "female",
  "de-DE-KasperNeural": "male",
  "de-DE-KillianNeural": "male",
  "de-DE-KlarissaNeural": "female",
  "de-DE-KlausNeural": "male",
  "de-DE-LouisaNeural": "female",
  "de-DE-MajaNeural": "female",
  "de-DE-RalfNeural": "male",
  "de-DE-TanjaNeural": "female",
  "en-GB-AdaMultilingualNeural": "female",
  "en-GB-OllieMultilingualNeural": "male",
  "en-GB-SoniaNeural": "female",
  "en-GB-RyanNeural": "male",
  "en-GB-LibbyNeural": "female",
  "en-GB-AbbiNeural": "female",
  "en-GB-AlfieNeural": "male",
  "en-GB-BellaNeural": "female",
  "en-GB-ElliotNeural": "male",
  "en-GB-EthanNeural": "male",
  "en-GB-HollieNeural": "female",
  "en-GB-NoahNeural": "male",
  "en-GB-OliverNeural": "male",
  "en-GB-OliviaNeural": "female",
  "en-GB-ThomasNeural": "male",
};

const az = (voice: string, rate = "+0%"): AzureCast => ({ voice, rate });

/**
 * One row per seat. Core seats keep the voices they had where the gender already matched, so
 * cached audio stays valid; pv changed from a male ElevenLabs voice to a female one (its Azure
 * voices were already female), and its English Azure voice from a child voice to an adult one.
 * en-GB has fewer adult voices than there are seats, so optional seats share some English
 * voices (azureVoiceTable swaps in an unused voice of the same gender when it can).
 */
export const CAST: Record<string, CastEntry> = {
  moderator: {
    gender: "female",
    eleven: "XrExE9yKIg1WjnnlVkGX",
    speed: 1.0,
    azure: { de: az("de-AT-IngridNeural"), en: az("en-GB-SoniaNeural") },
  },
  expert: {
    gender: "male",
    eleven: "bIHbv24MWmeRgasZH58o",
    speed: 0.98,
    azure: { de: az("de-DE-FlorianMultilingualNeural", "-1%"), en: az("en-GB-AlfieNeural", "-1%") },
  },
  gm: {
    gender: "male",
    eleven: "onwK4e9ZLuTAKqWW03F9",
    speed: 1.0,
    azure: { de: az("de-AT-JonasNeural", "+2%"), en: az("en-GB-RyanNeural", "+2%") },
  },
  sv: {
    gender: "female",
    eleven: "pFZP5JQG7iQjIQuC4Bku",
    speed: 1.03,
    azure: { de: az("de-DE-KatjaNeural", "+4%"), en: az("en-GB-LibbyNeural", "+4%") },
  },
  ak: {
    gender: "male",
    eleven: "pqHfZKP75CvOlQylNhV4",
    speed: 0.97,
    azure: { de: az("de-DE-ConradNeural", "-3%"), en: az("en-GB-ThomasNeural", "-3%") },
  },
  va: {
    gender: "male",
    eleven: "cjVigY5qzO86Huf0OWal",
    speed: 1.04,
    azure: { de: az("de-CH-JanNeural", "+5%"), en: az("en-GB-ElliotNeural", "+5%") },
  },
  ka: {
    gender: "female",
    eleven: "FGY2WhTYpPnrIDTdsKH5",
    speed: 1.0,
    azure: { de: az("de-DE-AmalaNeural", "-2%"), en: az("en-GB-HollieNeural", "-2%") },
  },
  pf: {
    gender: "female",
    eleven: "cgSgspJ2msm6clMCkdW9",
    speed: 1.02,
    azure: { de: az("de-DE-ElkeNeural", "+3%"), en: az("en-GB-BellaNeural", "+3%") },
  },
  bl: {
    gender: "male",
    eleven: "CwhRBWXzGAHq8TQ4Fs17",
    speed: 0.98,
    azure: { de: az("de-DE-KillianNeural", "-4%"), en: az("en-GB-OliverNeural", "-4%") },
  },
  pv: {
    gender: "female",
    eleven: "EXAVITQu4vr4xnSDxMaL",
    speed: 1.02,
    azure: { de: az("de-CH-LeniNeural", "+6%"), en: az("en-GB-OliviaNeural", "+4%") },
  },
  fm: {
    gender: "male",
    eleven: "nPczCjzI2devNBz1zQrb",
    speed: 0.96,
    azure: { de: az("de-DE-BerndNeural", "-6%"), en: az("en-GB-NoahNeural", "-6%") },
  },
  // optional institutions (FR-A9)
  // Every seat needs an ElevenLabs voice; the free tier has only seven female premade voices for
  // eight female-cast seats, so the legislature seat is cast male with a voice no other seat uses.
  nr: {
    gender: "male",
    eleven: "pNInz6obpgDQGcFmaJgB",
    speed: 1.0,
    azure: { de: az("de-DE-KasperNeural", "-1%"), en: az("en-GB-OliverNeural", "-1%") },
  },
  ph: {
    gender: "female",
    eleven: "Xb7hH8MSUJpSbSDYk0k2",
    speed: 1.0,
    azure: { de: az("de-DE-SeraphinaMultilingualNeural"), en: az("en-GB-AdaMultilingualNeural") },
  },
  abk: {
    gender: "female",
    eleven: "hpp4J3VqNfWAUOO0d1Us",
    speed: 1.02,
    azure: { de: az("de-DE-TanjaNeural", "+2%"), en: az("en-GB-AbbiNeural", "+2%") },
  },
  wk: {
    gender: "male",
    eleven: "TX3LPaxmHKxFdv7VOQHJ",
    speed: 1.02,
    azure: { de: az("de-DE-KlausNeural", "+1%"), en: az("en-GB-OllieMultilingualNeural", "+1%") },
  },
  lk: {
    gender: "male",
    eleven: "JBFqnCBsd6RMkjVDRZzb",
    speed: 0.98,
    azure: { de: az("de-DE-RalfNeural", "-2%"), en: az("en-GB-EthanNeural", "-2%") },
  },
  ind: {
    gender: "male",
    eleven: "iP95p4xoKVk53GoZ742B",
    speed: 1.0,
    azure: { de: az("de-DE-ChristophNeural"), en: az("en-GB-EthanNeural") },
  },
};

/** Presentation gender of a seat; seats outside the cast alternate by a stable hash. */
export function castGender(id: string): CastGender {
  const c = CAST[id];
  if (c) return c.gender;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2 ? "male" : "female";
}
