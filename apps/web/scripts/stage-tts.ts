// Pre-renders one audio file per utterance for the avatar stage (PRD 2.15, FR-S2, FR-S3).
//
//   pnpm --filter @sv/web stage:tts <runId> [--lang de|en|both] [--from <url>] [--limit N]
//                                          [--dry-run] [--force] [--provider azure|elevenlabs]
//                                          [--span showpiece|all] [--budget N] [--ids a,b]
//
// Source of the record: runs/<runId>.ndjson (SV_REPLAY_DIR), else the running app's stream
// route (--from http://localhost:3001, speed=0). Output: apps/web/public/stage/<runId>/<lang>/
// <utteranceId>.mp3 plus manifest.json, which the stage picks up; without a manifest the stage
// runs silent and says so. Audio is gitignored; only this script is committed. Rendering is
// offline and cached, so the stage has no live TTS dependency (FR-S3); the browser Web Speech
// API is never used.
//
// Providers (STAGE_TTS_PROVIDER):
//   azure (default)  Azure AI Speech REST, https://<region>.tts.speech.microsoft.com, SSML,
//                    neural voices. Key: STAGE_TTS_KEY, else OPENAI_COMPATIBLE_API_KEY (the
//                    team's AI Services key also works for Speech). Region: STAGE_TTS_REGION,
//                    default germanywestcentral (the only region that accepted the key in the
//                    2026-11-05 probe). Billed per character, roughly USD 16 per million.
//   openai           POST {OPENAI_COMPATIBLE_BASE_URL}/audio/speech, deployment STAGE_TTS_MODEL
//                    (default gpt-4o-mini-tts). Probe on 2026-11-05: listed under /models but
//                    not deployed on the team resource (404 DeploymentNotFound).
//   elevenlabs       POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}, model
//                    ELEVENLABS_MODEL (default eleven_multilingual_v2), mp3_44100_128, no request
//                    stitching. Key: ELEVENLABS_API_KEY. Writes <utteranceId>.el.mp3 and
//                    manifest.elevenlabs.json next to the Azure files; the stage prefers the
//                    .el.mp3 per utterance and plays Azure everywhere else. Any ElevenLabs error
//                    falls back to Azure for that utterance. Characters are capped by --budget
//                    (default 8000) and by the account's remaining quota minus a 500 reserve;
//                    --span showpiece (default for this provider) voices only the FR-S8 exchange
//                    and its neighbours. Voices and the upgrade path: public/stage/VOICES.md.
//                    Free-tier audio is non-commercial and must be attributed to ElevenLabs.
//
// The on-demand route (app/api/runs/[runId]/tts) always renders with Azure, so live runs never
// depend on the ElevenLabs quota.
//
// Voices are fixed per institution so each keeps the same voice across runs (FR-S2), and the
// speaking rate varies slightly per speaker. They are stock synthetic voices; none imitates a
// real person, and the stage never names a person (CON-1/CON-2).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foldRun, type RunEvent } from "@sv/contracts";
import {
  type AudioManifest,
  EL_MANIFEST,
  orderedUtterances,
  pickSharpestExchange,
  showpieceSpan,
} from "../components/stage/stage-logic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "../..");

/** Azure neural voice and prosody rate per speaker and language. de-AT first, then de-CH/de-DE. */
const AZURE_VOICES: Record<string, Record<string, { voice: string; rate: string }>> = {
  de: {
    moderator: { voice: "de-AT-IngridNeural", rate: "+0%" },
    gm: { voice: "de-AT-JonasNeural", rate: "+2%" },
    sv: { voice: "de-DE-KatjaNeural", rate: "+4%" },
    ak: { voice: "de-DE-ConradNeural", rate: "-3%" },
    va: { voice: "de-CH-JanNeural", rate: "+5%" },
    ka: { voice: "de-DE-AmalaNeural", rate: "-2%" },
    pf: { voice: "de-DE-ElkeNeural", rate: "+3%" },
    bl: { voice: "de-DE-KillianNeural", rate: "-4%" },
    pv: { voice: "de-CH-LeniNeural", rate: "+6%" },
    fm: { voice: "de-DE-BerndNeural", rate: "-6%" },
    expert: { voice: "de-DE-FlorianMultilingualNeural", rate: "-1%" },
  },
  en: {
    moderator: { voice: "en-GB-SoniaNeural", rate: "+0%" },
    gm: { voice: "en-GB-RyanNeural", rate: "+2%" },
    sv: { voice: "en-GB-LibbyNeural", rate: "+4%" },
    ak: { voice: "en-GB-ThomasNeural", rate: "-3%" },
    va: { voice: "en-GB-ElliotNeural", rate: "+5%" },
    ka: { voice: "en-GB-HollieNeural", rate: "-2%" },
    pf: { voice: "en-GB-BellaNeural", rate: "+3%" },
    bl: { voice: "en-GB-OliverNeural", rate: "-4%" },
    pv: { voice: "en-GB-MaisieNeural", rate: "+6%" },
    fm: { voice: "en-GB-NoahNeural", rate: "-6%" },
    expert: { voice: "en-GB-AlfieNeural", rate: "-1%" },
  },
};
const AZURE_LOCALE: Record<string, string[]> = {
  de: ["de-AT", "de-CH", "de-DE"],
  en: ["en-GB"],
};

const OPENAI_VOICES: Record<string, string> = {
  moderator: "sage",
  expert: "fable",
  gm: "onyx",
  sv: "coral",
  ak: "ash",
  va: "echo",
  ka: "ballad",
  pf: "shimmer",
  bl: "verse",
  pv: "nova",
  fm: "alloy",
};
const OPENAI_STYLE: Record<string, string> = {
  de: "Sprich sachliches Hochdeutsch mit leichter österreichischer Färbung, ruhiges Verhandlungstempo.",
  en: "Speak clear, neutral English at a calm negotiation pace, as in a formal meeting.",
};

/**
 * ElevenLabs premade voices per speaker (the free tier rejects library voices over the API with
 * 402 paid_plan_required, so only premade voices are usable). All eleven are verified for German
 * (de-DE) on eleven_multilingual_v2 and none is a clone of a public figure. Speakers outside this
 * table stay on Azure. Details and the upgrade path: public/stage/VOICES.md.
 */
const ELEVEN_VOICES: Record<string, { id: string; name: string; speed: number }> = {
  moderator: { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", speed: 1.0 },
  gm: { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", speed: 1.0 },
  sv: { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", speed: 1.03 },
  ak: { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", speed: 0.97 },
  va: { id: "cjVigY5qzO86Huf0OWal", name: "Eric", speed: 1.04 },
  ka: { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", speed: 1.0 },
  pf: { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", speed: 1.02 },
  bl: { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", speed: 0.98 },
  pv: { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", speed: 1.04 },
  fm: { id: "nPczCjzI2devNBz1zQrb", name: "Brian", speed: 0.96 },
  expert: { id: "bIHbv24MWmeRgasZH58o", name: "Will", speed: 0.98 },
};
const ELEVEN_ATTRIBUTION =
  "Stimmen in diesem Abschnitt: ElevenLabs (elevenlabs.io), Free-Tarif, nicht kommerziell.";
const ELEVEN_RESERVE = 500;

interface Utt {
  id: string;
  speaker: string;
  text: { lang: string; text: string; translations: Record<string, string | undefined> };
}

interface Voice {
  voice: string;
  rate: string;
}

function loadEnv(): Record<string, string> {
  const file = path.join(repoRoot, ".env");
  const out: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1]) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
  // Non-empty process values win; an empty variable inherited from a parent (for example the
  // Next dev server) must not mask the key in the repo's .env.
  for (const [k, v] of Object.entries(process.env)) if (v) out[k] = v;
  return out;
}

function args() {
  const a = process.argv.slice(2);
  const valued = new Set([
    "--lang",
    "--from",
    "--limit",
    "--provider",
    "--span",
    "--budget",
    "--ids",
  ]);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const runId = a.find((x, i) => !x.startsWith("--") && !valued.has(a[i - 1] ?? ""));
  return {
    runId,
    lang: get("--lang") ?? "both",
    from: get("--from"),
    limit: Number(get("--limit") ?? "0") || 0,
    dry: a.includes("--dry-run"),
    force: a.includes("--force"),
    provider: get("--provider"),
    span: get("--span"),
    budget: Number(get("--budget") ?? "0") || 0,
    ids: get("--ids")?.split(",").filter(Boolean),
  };
}

function parseEvents(ndjson: string): RunEvent[] {
  return ndjson
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
}

function utterancesOf(events: RunEvent[]): Utt[] {
  const out: Utt[] = [];
  for (const e of events as Array<{ type: string; utterance?: Utt }>) {
    if (e.type === "utterance.completed" && e.utterance) out.push(e.utterance);
  }
  return out;
}

async function loadRecord(runId: string, from: string | undefined, env: Record<string, string>) {
  const dir = path.resolve(repoRoot, env.SV_REPLAY_DIR ?? "runs");
  const file = path.join(dir, `${runId}.ndjson`);
  if (!from && existsSync(file)) return parseEvents(readFileSync(file, "utf8"));
  const base = from ?? "http://localhost:3001";
  const r = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}/stream?speed=0`);
  if (!r.ok) throw new Error(`stream ${r.status}: run ${runId} not found at ${base}`);
  return parseEvents(await r.text());
}

const textFor = (u: Utt, lang: string) =>
  u.text.lang === lang ? u.text.text : (u.text.translations[lang] ?? u.text.text);

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Checks the configured voices against the region's list; unknown ones get an unused spare. */
async function azureVoiceTable(
  region: string,
  key: string,
  lang: string,
  speakers: string[],
): Promise<Record<string, Voice>> {
  const r = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
    {
      headers: { "Ocp-Apim-Subscription-Key": key },
    },
  );
  if (!r.ok) throw new Error(`Azure Speech voices/list ${r.status} in ${region}`);
  const all = (await r.json()) as Array<{ ShortName: string; Locale: string }>;
  const locales = AZURE_LOCALE[lang] ?? [];
  const available = all.filter((v) => locales.includes(v.Locale)).map((v) => v.ShortName);
  const wanted = AZURE_VOICES[lang] ?? {};
  const used = new Set<string>();
  const table: Record<string, Voice> = {};
  for (const sp of speakers) {
    const w = wanted[sp];
    if (w && available.includes(w.voice) && !used.has(w.voice)) table[sp] = w;
  }
  for (const v of Object.values(table)) used.add(v.voice);
  for (const sp of speakers) {
    if (table[sp]) continue;
    const spare = available.find((v) => !used.has(v)) ?? available[0];
    if (!spare) throw new Error(`no ${lang} voice in ${region}`);
    used.add(spare);
    table[sp] = { voice: spare, rate: "+0%" };
  }
  return table;
}

async function azureSynth(region: string, key: string, v: Voice, text: string): Promise<Buffer> {
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

async function openaiSynth(
  base: string,
  key: string,
  model: string,
  voice: string,
  lang: string,
  text: string,
): Promise<Buffer> {
  const r = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      instructions: OPENAI_STYLE[lang],
      response_format: "mp3",
    }),
  });
  if (!r.ok)
    throw new Error(`audio/speech ${r.status} (model ${model}): ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

const EL_API = "https://api.elevenlabs.io/v1";

async function elevenQuota(key: string): Promise<{ used: number; limit: number; tier: string }> {
  const r = await fetch(`${EL_API}/user/subscription`, { headers: { "xi-api-key": key } });
  if (!r.ok) throw new Error(`ElevenLabs subscription ${r.status}`);
  const d = (await r.json()) as { character_count: number; character_limit: number; tier: string };
  return { used: d.character_count, limit: d.character_limit, tier: d.tier };
}

/** One utterance, one request: no previous_text/next_text or request ids (stitching off). */
async function elevenSynth(
  key: string,
  model: string,
  voiceId: string,
  speed: number,
  text: string,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(
      `${EL_API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: model,
          // calm negotiation register: steady but not flat, close to the voice, little styling
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.15,
            use_speaker_boost: true,
            speed,
          },
        }),
      },
    );
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    // 429 is concurrency on the free tier: wait once; everything else goes to the fallback
    if (r.status !== 429 || attempt > 0) {
      throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("ElevenLabs: retries exhausted");
}

function readManifest(file: string): AudioManifest | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as AudioManifest;
  } catch {
    return null;
  }
}

function writeManifest(file: string, m: AudioManifest) {
  writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`);
}

/**
 * ElevenLabs variant for one language. Voices a span of utterances (the FR-S8 showpiece by
 * default) into <id>.el.mp3 and merges them into manifest.elevenlabs.json. An utterance that
 * fails gets an Azure file instead (if it has none yet), merged into manifest.json.
 */
async function renderEleven(
  opt: ReturnType<typeof args>,
  env: Record<string, string>,
  events: RunEvent[],
  lang: string,
) {
  const key = env.ELEVENLABS_API_KEY ?? "";
  if (!key) throw new Error("no ELEVENLABS_API_KEY");
  const model = env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
  const all = orderedUtterances(foldRun(events)) as unknown as Utt[];
  const chars = (i: number) => {
    const u = all[i];
    return u ? textFor(u, lang).length : 0;
  };
  const budget = opt.budget || 8000;
  let pick: number[];
  if (opt.ids) pick = all.flatMap((u, i) => (opt.ids?.includes(u.id) ? [i] : []));
  else if ((opt.span ?? "showpiece") === "all") pick = all.map((_, i) => i);
  else pick = showpieceSpan(all, pickSharpestExchange(foldRun(events)), budget, chars);
  if (opt.limit) pick = pick.slice(0, opt.limit);
  const planned = pick.reduce((n, i) => n + chars(i), 0);
  const ex = pickSharpestExchange(foldRun(events));
  console.log(
    `elevenlabs ${lang}: ${pick.length} utterances, ${planned} characters` +
      (ex ? ` (exchange ${ex.fromId} -> ${ex.toId})` : "") +
      (pick.length
        ? `, span ${all[pick[0] ?? 0]?.id} .. ${all[pick[pick.length - 1] ?? 0]?.id}`
        : ""),
  );
  const q = await elevenQuota(key);
  const left = q.limit - q.used;
  console.log(`quota before: ${q.used}/${q.limit} used (${q.tier}), ${left} left`);
  if (planned > budget) throw new Error(`planned ${planned} > --budget ${budget}`);
  if (planned > left - ELEVEN_RESERVE) {
    throw new Error(`planned ${planned} > remaining quota ${left} minus reserve ${ELEVEN_RESERVE}`);
  }
  if (opt.dry) return;

  const outDir = path.join(webRoot, "public", "stage", opt.runId ?? "", lang);
  mkdirSync(outDir, { recursive: true });
  const elFile = path.join(outDir, EL_MANIFEST);
  const prev = readManifest(elFile);
  const files: Record<string, string> = { ...(prev?.files ?? {}) };
  const failed: Utt[] = [];
  let spent = 0;
  for (const i of pick) {
    const u = all[i];
    if (!u) continue;
    const v = ELEVEN_VOICES[u.speaker];
    const name = `${u.id}.el.mp3`;
    if (!v) {
      console.log(`\n${u.id}: no ElevenLabs voice for ${u.speaker}, stays on Azure`);
      continue;
    }
    if (existsSync(path.join(outDir, name)) && !opt.force) {
      files[u.id] = name;
      continue;
    }
    const text = textFor(u, lang);
    try {
      writeFileSync(path.join(outDir, name), await elevenSynth(key, model, v.id, v.speed, text));
      files[u.id] = name;
      spent += text.length;
      process.stdout.write(
        `\r${lang} ${Object.keys(files).length} el files, ${spent} chars ${u.id}   `,
      );
    } catch (e) {
      console.log(`\n${u.id}: ${e instanceof Error ? e.message : e}; Azure fallback`);
      delete files[u.id];
      failed.push(u);
    }
  }
  writeManifest(elFile, {
    runId: opt.runId ?? "",
    lang,
    model: `elevenlabs/${model}`,
    provider: "elevenlabs",
    attribution: ELEVEN_ATTRIBUTION,
    voices: Object.fromEntries(
      Object.entries(ELEVEN_VOICES).map(([k, v]) => [k, `${v.name} ${v.id}`]),
    ),
    files,
  });
  if (failed.length) await azureFallback(opt.runId ?? "", env, lang, outDir, failed);
  const after = await elevenQuota(key).catch(() => null);
  console.log(
    `\nelevenlabs ${lang}: ${spent} characters sent, ${Object.keys(files).length} files in ${EL_MANIFEST}` +
      (after
        ? `; quota after: ${after.used}/${after.limit} (${after.limit - after.used} left)`
        : ""),
  );
}

/** Azure files for utterances ElevenLabs could not voice, merged into manifest.json. */
async function azureFallback(
  runId: string,
  env: Record<string, string>,
  lang: string,
  outDir: string,
  utts: Utt[],
) {
  const key = env.STAGE_TTS_KEY ?? env.OPENAI_COMPATIBLE_API_KEY ?? "";
  const region = env.STAGE_TTS_REGION ?? "germanywestcentral";
  if (!key) {
    console.log("no Azure key: failed utterances stay silent");
    return;
  }
  const speakers = [...new Set(["moderator", ...utts.map((u) => u.speaker), "expert"])];
  const table = await azureVoiceTable(region, key, lang, speakers);
  const mFile = path.join(outDir, "manifest.json");
  const m: AudioManifest = readManifest(mFile) ?? {
    runId,
    lang,
    model: `azure-speech/${region}`,
    voices: {},
    files: {},
  };
  for (const u of utts) {
    const name = `${u.id}.mp3`;
    if (!existsSync(path.join(outDir, name))) {
      const v = table[u.speaker] ?? { voice: "de-AT-IngridNeural", rate: "+0%" };
      writeFileSync(path.join(outDir, name), await azureSynth(region, key, v, textFor(u, lang)));
    }
    m.files[u.id] = name;
  }
  writeManifest(mFile, m);
  console.log(`azure fallback: ${utts.length} utterances in manifest.json`);
}

async function main() {
  const opt = args();
  if (!opt.runId) {
    console.error(
      "usage: stage:tts <runId> [--lang de|en|both] [--from <url>] [--limit N] [--dry-run] [--force]",
    );
    process.exit(2);
  }
  const env = loadEnv();
  const provider = opt.provider ?? env.STAGE_TTS_PROVIDER ?? "azure";
  if (provider === "elevenlabs") {
    const events = await loadRecord(opt.runId, opt.from, env);
    // German unless a language is asked for: the quota is too small for both
    const explicit = process.argv.includes("--lang");
    for (const lang of opt.lang === "both" ? (explicit ? ["de", "en"] : ["de"]) : [opt.lang]) {
      await renderEleven(opt, env, events, lang);
    }
    return;
  }
  const key = env.STAGE_TTS_KEY ?? env.OPENAI_COMPATIBLE_API_KEY ?? "";
  const region = env.STAGE_TTS_REGION ?? "germanywestcentral";
  const base = (env.OPENAI_COMPATIBLE_BASE_URL ?? "").replace(/\/$/, "");
  const model = env.STAGE_TTS_MODEL ?? "gpt-4o-mini-tts";
  if (!key) throw new Error("no TTS key: set STAGE_TTS_KEY or OPENAI_COMPATIBLE_API_KEY");

  let utts = utterancesOf(await loadRecord(opt.runId, opt.from, env));
  if (opt.limit) utts = utts.slice(0, opt.limit);
  const speakers = [...new Set(["moderator", ...utts.map((u) => u.speaker), "expert"])];
  const langs = opt.lang === "both" ? ["de", "en"] : [opt.lang];
  let totalChars = 0;

  for (const lang of langs) {
    const table: Record<string, Voice> =
      provider === "azure"
        ? await azureVoiceTable(region, key, lang, speakers)
        : Object.fromEntries(
            speakers.map((s) => [s, { voice: OPENAI_VOICES[s] ?? "alloy", rate: "+0%" }]),
          );
    console.log(`${lang} voices (${provider}):`);
    for (const s of speakers) console.log(`  ${s.padEnd(9)} ${table[s]?.voice} ${table[s]?.rate}`);

    const outDir = path.join(webRoot, "public", "stage", opt.runId, lang);
    if (!opt.dry) mkdirSync(outDir, { recursive: true });
    const files: Record<string, string> = {};
    let rendered = 0;
    let chars = 0;
    for (const u of utts) {
      const name = `${u.id}.mp3`;
      const target = path.join(outDir, name);
      const input = textFor(u, lang);
      const v = table[u.speaker] ?? { voice: "alloy", rate: "+0%" };
      if (opt.dry) {
        chars += input.length;
        continue;
      }
      if (existsSync(target) && !opt.force) {
        files[u.id] = name;
        continue;
      }
      const audio =
        provider === "azure"
          ? await azureSynth(region, key, v, input)
          : await openaiSynth(base, key, model, v.voice, lang, input);
      writeFileSync(target, audio);
      files[u.id] = name;
      rendered++;
      chars += input.length;
      process.stdout.write(`\r${lang} ${rendered}/${utts.length} ${u.id}   `);
    }
    totalChars += chars;
    if (!opt.dry) {
      const voices = Object.fromEntries(speakers.map((s) => [s, table[s]?.voice ?? ""]));
      writeFileSync(
        path.join(outDir, "manifest.json"),
        `${JSON.stringify(
          {
            runId: opt.runId,
            lang,
            model: provider === "azure" ? `azure-speech/${region}` : model,
            voices,
            files,
          },
          null,
          2,
        )}\n`,
      );
      console.log(`\n${lang}: ${rendered} rendered, ${Object.keys(files).length} in manifest`);
    }
  }
  const usd = (totalChars / 1_000_000) * 16;
  console.log(
    `${opt.dry ? "[dry] would bill" : "billed"} about ${totalChars} characters (~USD ${usd.toFixed(2)} at neural list price)`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
