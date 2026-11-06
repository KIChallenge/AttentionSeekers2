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
//   elevenlabs       POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream, voices
//                    from lib/stage-voices.json, model ELEVENLABS_MODEL (default
//                    eleven_multilingual_v2), mp3_44100_128, no request
//                    stitching. Key: ELEVENLABS_API_KEY. Writes <utteranceId>.el.mp3 and
//                    manifest.elevenlabs.json next to the Azure files; the stage prefers the
//                    .el.mp3 per utterance and plays Azure everywhere else. Any ElevenLabs error
//                    falls back to Azure for that utterance. Characters are capped by --budget
//                    (default 8000) and by the account's remaining quota minus a 500 reserve;
//                    --span showpiece (default for this provider) voices only the FR-S8 exchange
//                    and its neighbours. Voices and the upgrade path: public/stage/VOICES.md.
//                    Free-tier audio is non-commercial and must be attributed to ElevenLabs.
//
// This script is for offline preparation. At play time the stage voices each utterance lazily
// through app/api/runs/[runId]/tts/[uttId] (ElevenLabs while quota lasts, Azure otherwise) and
// shares this script's cache; POST app/api/runs/[runId]/tts still runs this script for a whole
// run with Azure.
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
import {
  type AzureVoice,
  azureSynth,
  azureVoiceTable,
  costMultiplier,
  ELEVEN_ATTRIBUTION,
  elevenQuota,
  elevenSynth,
  loadEnv as loadEnvFile,
  loadVoiceTable,
  readManifest,
  writeManifest,
} from "../lib/tts-providers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "../..");

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

const ELEVEN_RESERVE = 500;

interface Utt {
  id: string;
  speaker: string;
  text: { lang: string; text: string; translations: Record<string, string | undefined> };
}

type Voice = AzureVoice;

const loadEnv = () => loadEnvFile(repoRoot);

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
  const table = loadVoiceTable(webRoot, env);
  // offline renders favour quality; the live route uses the table's low-latency model
  const model = env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
  const mult = costMultiplier(model);
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
  const planned = Math.ceil(pick.reduce((n, i) => n + chars(i), 0) * mult);
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
    const v = table.voices[u.speaker];
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
      writeFileSync(path.join(outDir, name), await elevenSynth(key, model, v, text, lang));
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
      Object.entries(table.voices).map(([k, v]) => [k, `${v.name} ${v.id}`]),
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
