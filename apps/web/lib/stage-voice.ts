// Lazy per-utterance voicing for the stage (server-only). An utterance is rendered the first
// time someone listens to it: ElevenLabs where a voice, a key and quota exist, Azure otherwise
// and on any ElevenLabs error. Results are cached next to the offline renders
// (public/stage/<runId>/<lang>/<uttId>.el.mp3 or <uttId>.mp3) and merged into the manifests,
// so the offline script, this route and the stage share one cache.
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseNdjson, type RunEvent, type Utterance } from "@sv/contracts";
import { EL_MANIFEST } from "@/components/stage/stage-logic";
import { loadRunEvents, replayDir } from "@/lib/runs";
import {
  type AzureVoice,
  azureSynth,
  azureVoiceTable,
  costMultiplier,
  ELEVEN_ATTRIBUTION,
  type ElevenQuota,
  elevenQuota,
  elevenStream,
  loadEnv,
  loadVoiceTable,
  type ManifestFile,
  readManifest,
  writeFileAtomic,
  writeManifest,
} from "@/lib/tts-providers";

export type VoiceProvider = "elevenlabs" | "azure";

export const RUN_ID = /^[A-Za-z0-9_-]{1,120}$/;
export const UTT_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Credits kept free so a demo never runs the account to zero mid-sentence. */
const QUOTA_RESERVE = 200;
const QUOTA_TTL_MS = 60_000;
const RECORD_TTL_MS = 5_000;

const webRoot = process.cwd();
const repoRoot = path.resolve(
  /*turbopackIgnore: true*/ webRoot,
  webRoot.endsWith(path.join("apps", "web")) ? "../.." : ".",
);

// Module state survives dev hot reloads through globalThis.
interface State {
  inflight: Map<string, Promise<VoiceProvider>>;
  manifestLock: Map<string, Promise<unknown>>;
  quota: {
    at: number;
    value: ElevenQuota | null;
    spent: number;
    refreshing: Promise<ElevenQuota | null> | null;
  } | null;
  records: Map<string, { at: number; mtime: number; done: boolean; events: RunEvent[] }>;
  azure: Map<string, Record<string, AzureVoice>>;
}
const g = globalThis as unknown as { __svStageVoice?: State };
g.__svStageVoice ??= {
  inflight: new Map(),
  manifestLock: new Map(),
  quota: null,
  records: new Map(),
  azure: new Map(),
};
const st: State = g.__svStageVoice;

export function env() {
  return loadEnv(repoRoot);
}

export function outDir(runId: string, lang: string) {
  return path.join(/*turbopackIgnore: true*/ webRoot, "public", "stage", runId, lang);
}

function cached(runId: string, lang: string, uttId: string, provider: VoiceProvider) {
  const file = path.join(
    outDir(runId, lang),
    provider === "elevenlabs" ? `${uttId}.el.mp3` : `${uttId}.mp3`,
  );
  return existsSync(file) && statSync(file).size > 0 ? { file, provider } : null;
}

/** Cached file for an utterance: the ElevenLabs file wins over the Azure one. */
export function cachedFile(
  runId: string,
  lang: string,
  uttId: string,
): { file: string; provider: VoiceProvider } | null {
  return cached(runId, lang, uttId, "elevenlabs") ?? cached(runId, lang, uttId, "azure");
}

export function inflightProvider(runId: string, lang: string, uttId: string) {
  return st.inflight.has(`${runId}/${lang}/${uttId}`);
}

/**
 * Month-to-date ElevenLabs usage, refreshed at most every 60 s; spend rendered here counts in
 * between. Stale-while-revalidate: once a value exists it answers at once and a stale one is
 * refreshed in the background, so the quota check never sits in front of a first play.
 */
export async function quota(): Promise<ElevenQuota | null> {
  const key = env().ELEVENLABS_API_KEY;
  if (!key) return null;
  const refresh = () => {
    const p = elevenQuota(key)
      .catch(() => null)
      .then((value) => {
        st.quota = { at: Date.now(), value, spent: 0, refreshing: null };
        return value;
      });
    if (st.quota) st.quota.refreshing = p;
    return p;
  };
  const q = st.quota;
  if (!q?.value) return q?.refreshing ?? refresh();
  if (Date.now() - q.at > QUOTA_TTL_MS && !q.refreshing) void refresh();
  return { ...q.value, used: q.value.used + q.spent };
}

/** The utterance if the record has it completed; lines still being written are never voiced. */
async function writtenUtterance(runId: string, uttId: string): Promise<Utterance | null> {
  const now = Date.now();
  let rec = st.records.get(runId);
  // A replay file is read directly (the database attempt costs seconds when it is down); a
  // completed record stays cached until the file changes, a running one for a few seconds.
  const file = path.join(/*turbopackIgnore: true*/ replayDir(), `${runId}.ndjson`);
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  const fresh = rec && (rec.done ? rec.mtime === mtime : now - rec.at < RECORD_TTL_MS);
  if (!rec || !fresh) {
    const events = mtime ? parseNdjson(await readFile(file, "utf8")) : await loadRunEvents(runId);
    if (!events) return null;
    rec = { at: now, mtime, done: events.some((e) => e.type === "run.completed"), events };
    st.records.set(runId, rec);
  }
  for (const e of rec.events) {
    if (e.type === "utterance.completed" && e.utterance.id === uttId) return e.utterance;
  }
  return null;
}

const textOf = (u: Utterance, lang: string) =>
  u.text.lang === lang ? u.text.text : (u.text.translations[lang as "de" | "en"] ?? u.text.text);

/** Serialises read-modify-write of one manifest file within this process. */
function withLock<T>(file: string, fn: () => T): Promise<T> {
  const prev = st.manifestLock.get(file) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  st.manifestLock.set(
    file,
    next.catch(() => undefined),
  );
  return next;
}

function addToManifest(
  runId: string,
  lang: string,
  uttId: string,
  provider: VoiceProvider,
  model: string,
  voices: Record<string, string>,
) {
  const dir = outDir(runId, lang);
  const file = path.join(dir, provider === "elevenlabs" ? EL_MANIFEST : "manifest.json");
  return withLock(file, () => {
    const m: ManifestFile = readManifest(file) ?? {
      runId,
      lang,
      model,
      voices: {},
      files: {},
      ...(provider === "elevenlabs"
        ? { provider: "elevenlabs" as const, attribution: ELEVEN_ATTRIBUTION }
        : {}),
    };
    m.files[uttId] = provider === "elevenlabs" ? `${uttId}.el.mp3` : `${uttId}.mp3`;
    m.voices = { ...voices, ...m.voices };
    writeManifest(file, m);
  });
}

async function azureVoiceFor(lang: string, speaker: string, e: Record<string, string>) {
  const key = e.STAGE_TTS_KEY ?? e.OPENAI_COMPATIBLE_API_KEY ?? "";
  const region = e.STAGE_TTS_REGION ?? "germanywestcentral";
  if (!key) throw new Error("no Azure Speech key");
  let table = st.azure.get(lang);
  if (!table?.[speaker]) {
    const speakers = ["moderator", "gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm", "expert"];
    if (!speakers.includes(speaker)) speakers.push(speaker);
    table = await azureVoiceTable(region, key, lang, speakers);
    st.azure.set(lang, table);
  }
  const v = table[speaker];
  if (!v) throw new Error(`no Azure voice for ${speaker}`);
  return { key, region, v };
}

async function renderAzure(runId: string, lang: string, u: Utterance): Promise<Buffer> {
  const e = env();
  const { key, region, v } = await azureVoiceFor(lang, u.speaker, e);
  const audio = await azureSynth(region, key, v, textOf(u, lang));
  const dir = outDir(runId, lang);
  writeFileAtomic(path.join(dir, `${u.id}.mp3`), audio);
  await addToManifest(runId, lang, u.id, "azure", `azure-speech/${region}`, {
    [u.speaker]: v.voice,
  });
  return audio;
}

export type VoiceResult =
  | { kind: "file"; file: string; provider: VoiceProvider; cache: "hit" | "wait" }
  | { kind: "stream"; body: ReadableStream<Uint8Array>; provider: "elevenlabs"; timing: string }
  | { kind: "buffer"; body: Buffer; provider: "azure"; reason: string; timing: string }
  | { kind: "missing"; reason: string };

/**
 * Voice one utterance. A cached file is returned as is; a render already running for the same
 * utterance is awaited (one in-flight render per utterance); otherwise ElevenLabs streams the
 * audio while it is written to the cache, and Azure takes over on any ElevenLabs failure.
 *
 * Order: cached ElevenLabs file, fresh ElevenLabs render (while a key, a voice and quota are
 * there), cached Azure file, Azure render. A whole-run Azure base therefore does not block
 * ElevenLabs; it is the instant fallback once the quota is spent. STAGE_TTS_PREFER_CACHED_AZURE=1
 * serves a cached Azure file before rendering ElevenLabs.
 */
export async function voice(runId: string, lang: string, uttId: string): Promise<VoiceResult> {
  const t0 = performance.now();
  const marks: string[] = [];
  let tPrev = t0;
  const mark = (name: string) => {
    const t = performance.now();
    marks.push(`${name};dur=${(t - tPrev).toFixed(0)}`);
    tPrev = t;
  };
  const timing = () => marks.join(", ");
  const e = env();
  const hit =
    e.STAGE_TTS_PREFER_CACHED_AZURE === "1"
      ? cachedFile(runId, lang, uttId)
      : cached(runId, lang, uttId, "elevenlabs");
  if (hit) return { kind: "file", ...hit, cache: "hit" };
  const key = `${runId}/${lang}/${uttId}`;
  const running = st.inflight.get(key);
  if (running) {
    await running.catch(() => undefined);
    const after = cachedFile(runId, lang, uttId);
    return after
      ? { kind: "file", ...after, cache: "wait" }
      : { kind: "missing", reason: "render failed" };
  }
  // Claim the utterance before the first await, so parallel requests (the player and its
  // prefetch) join this render instead of starting their own. It settles once the file is cached.
  let settle: { resolve: (p: VoiceProvider) => void; reject: (err: unknown) => void } = {
    resolve: () => undefined,
    reject: () => undefined,
  };
  const done = new Promise<VoiceProvider>((resolve, reject) => {
    settle = { resolve, reject };
  });
  st.inflight.set(key, done);
  void done
    .catch(() => undefined)
    .finally(() => {
      if (st.inflight.get(key) === done) st.inflight.delete(key);
    });
  try {
    return await render(runId, lang, uttId, e, settle, mark, timing);
  } catch (err) {
    settle.reject(err);
    throw err;
  }
}

async function render(
  runId: string,
  lang: string,
  uttId: string,
  e: Record<string, string>,
  settle: { resolve: (p: VoiceProvider) => void; reject: (err: unknown) => void },
  mark: (name: string) => void,
  timing: () => string,
): Promise<VoiceResult> {
  const u = await writtenUtterance(runId, uttId);
  mark("record");
  if (!u) {
    settle.reject(new Error("not in the record"));
    return { kind: "missing", reason: "utterance not in the record (yet)" };
  }
  mkdirSync(outDir(runId, lang), { recursive: true });

  const table = loadVoiceTable(webRoot, e);
  const v = table.voices[u.speaker];
  const model = e.ELEVENLABS_LIVE_MODEL ?? table.model;
  const text = textOf(u, lang);
  const cost = Math.ceil(text.length * costMultiplier(model));
  let reason = "";
  if (e.STAGE_TTS_LIVE_PROVIDER === "azure") reason = "live provider set to azure";
  else if (!e.ELEVENLABS_API_KEY) reason = "no ElevenLabs key";
  else if (!v) reason = `no ElevenLabs voice for ${u.speaker}`;
  else {
    const q = await quota();
    if (!q) reason = "ElevenLabs quota unknown";
    else if (q.limit - q.used - QUOTA_RESERVE < cost) reason = "ElevenLabs quota exhausted";
    mark("quota");
  }

  const azureHit = cached(runId, lang, uttId, "azure");
  if (reason && azureHit) {
    settle.resolve("azure");
    return { kind: "file", ...azureHit, cache: "hit" };
  }

  if (!reason && v) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 10_000);
      const r = await elevenStream(e.ELEVENLABS_API_KEY ?? "", model, v, text, lang, ctl.signal);
      clearTimeout(t);
      mark("eleven");
      const [toClient, toCache] = (r.body as ReadableStream<Uint8Array>).tee();
      void (async () => {
        const chunks: Uint8Array[] = [];
        const reader = toCache.getReader();
        try {
          for (;;) {
            const { done: end, value } = await reader.read();
            if (end) break;
            chunks.push(value);
          }
          const audio = Buffer.concat(chunks);
          if (audio.length < 1024) throw new Error("ElevenLabs returned no audio");
          writeFileAtomic(path.join(outDir(runId, lang), `${uttId}.el.mp3`), audio);
          await addToManifest(runId, lang, uttId, "elevenlabs", `elevenlabs/${model}`, {
            [u.speaker]: `${v.name} ${v.id}`,
          });
          if (st.quota) st.quota.spent += cost;
          settle.resolve("elevenlabs");
        } catch (err) {
          settle.reject(err);
        }
      })();
      return { kind: "stream", body: toClient, provider: "elevenlabs", timing: timing() };
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
      // Azure takes over; a cached Azure file is instant
      if (azureHit) {
        settle.resolve("azure");
        return { kind: "file", ...azureHit, cache: "hit" };
      }
    }
  }

  try {
    const audio = await renderAzure(runId, lang, u);
    mark("azure");
    settle.resolve("azure");
    return { kind: "buffer", body: audio, provider: "azure", reason, timing: timing() };
  } catch (err) {
    settle.reject(err);
    return { kind: "missing", reason: `${reason}; Azure: ${String(err)}` };
  }
}

/** Range-aware response for a cached mp3 (the audio element seeks with byte ranges). */
export function fileResponse(
  req: Request,
  file: string,
  headers: Record<string, string>,
): Response {
  const data = readFileSync(file);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  const base = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=600",
    ...headers,
  };
  if (range && (range[1] || range[2])) {
    const size = data.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...base,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(new Uint8Array(data), {
    headers: { ...base, "Content-Length": String(data.length) },
  });
}
