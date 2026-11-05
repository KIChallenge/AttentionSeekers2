// Pre-renders one audio file per utterance for the avatar stage (PRD 2.15, FR-S2, FR-S3).
//
//   pnpm --filter @sv/web stage:tts <runId> [--lang de|en|both] [--from <url>] [--limit N]
//                                          [--dry-run] [--force]
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
//
// Voices are fixed per institution so each keeps the same voice across runs (FR-S2), and the
// speaking rate varies slightly per speaker. They are stock synthetic voices; none imitates a
// real person, and the stage never names a person (CON-1/CON-2).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const valued = new Set(["--lang", "--from", "--limit"]);
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
  };
}

function parseUtterances(ndjson: string): Utt[] {
  const out: Utt[] = [];
  for (const line of ndjson.split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as { type: string; utterance?: Utt };
    if (e.type === "utterance.completed" && e.utterance) out.push(e.utterance);
  }
  return out;
}

async function loadRecord(runId: string, from: string | undefined, env: Record<string, string>) {
  const dir = path.resolve(repoRoot, env.SV_REPLAY_DIR ?? "runs");
  const file = path.join(dir, `${runId}.ndjson`);
  if (!from && existsSync(file)) return parseUtterances(readFileSync(file, "utf8"));
  const base = from ?? "http://localhost:3001";
  const r = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}/stream?speed=0`);
  if (!r.ok) throw new Error(`stream ${r.status}: run ${runId} not found at ${base}`);
  return parseUtterances(await r.text());
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

async function main() {
  const opt = args();
  if (!opt.runId) {
    console.error(
      "usage: stage:tts <runId> [--lang de|en|both] [--from <url>] [--limit N] [--dry-run] [--force]",
    );
    process.exit(2);
  }
  const env = loadEnv();
  const provider = env.STAGE_TTS_PROVIDER ?? "azure";
  const key = env.STAGE_TTS_KEY ?? env.OPENAI_COMPATIBLE_API_KEY ?? "";
  const region = env.STAGE_TTS_REGION ?? "germanywestcentral";
  const base = (env.OPENAI_COMPATIBLE_BASE_URL ?? "").replace(/\/$/, "");
  const model = env.STAGE_TTS_MODEL ?? "gpt-4o-mini-tts";
  if (!key) throw new Error("no TTS key: set STAGE_TTS_KEY or OPENAI_COMPATIBLE_API_KEY");

  let utts = await loadRecord(opt.runId, opt.from, env);
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
