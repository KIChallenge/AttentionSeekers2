"use client";

import type { Utterance } from "@sv/contracts";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioManifest,
  type AudioProvider,
  audioFileFor,
  EL_MANIFEST,
  silentDurationMs,
  syntheticAmplitude,
} from "./stage-logic";

export type AudioState = "loading" | "waiting" | "rendering" | "on" | "off";

/**
 * Per-frame playback state for renderers that animate outside React (the 3D stage): playback
 * fraction of the current utterance and the voice amplitude, written by the player's own
 * animation frame, read by the consumer's. Never triggers a render.
 */
export interface StageLive {
  /** Playback fraction of the current utterance, 0..1. */
  p: number;
  /** Voice amplitude 0..1 (analyser RMS, or the synthetic envelope when silent). */
  amp: number;
  playing: boolean;
}

/** ElevenLabs characters this month, from /api/tts/usage (cached 60 s on the server). */
export interface VoiceUsage {
  tier: string;
  used: number;
  limit: number;
}

/**
 * Plays utterances one after another. Each utterance is an audio file routed through a Web
 * Audio analyser whose RMS drives the mouth bars; without audio, playback is silent and timed
 * by text length with a synthetic envelope. Amplitude goes straight into the CSS variable
 * --amp on `rootRef`, progress into state at word steps.
 *
 * Audio comes from /api/runs/<id>/tts/<uttId> (mode "route"): an utterance is voiced the first
 * time someone plays it (ElevenLabs, Azure as fallback) and cached; while playing, the next two
 * on the playlist are fetched ahead so they are ready. Nothing is rendered for lines nobody
 * plays, and the whole-run render is no longer triggered. Without the route (static hosting)
 * the offline manifests under /stage/<id>/<lang>/ are used (mode "static"), the ElevenLabs
 * file winning per utterance. The browser Web Speech API is never used.
 */
export function useStagePlayer({
  runId,
  lang,
  utterances,
  textOf,
  rootRef,
  initialIndex,
  nextOf,
}: {
  runId: string;
  lang: string;
  utterances: Utterance[];
  textOf: (u: Utterance) => string;
  rootRef: RefObject<HTMLElement | null>;
  initialIndex: number;
  /** Playlist step: index after `i`, or null to stop. Default: the next utterance. */
  nextOf?: (i: number) => number | null;
}) {
  const [idx, setIdxRaw] = useState(initialIndex);
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  /** Characters of the current utterance already spoken (word granularity). */
  const [spoken, setSpoken] = useState(0);
  const [manifest, setManifest] = useState<AudioManifest | null>(null);
  const [eleven, setEleven] = useState<AudioManifest | null>(null);
  const [audioState, setAudioState] = useState<AudioState>("loading");

  const elapsedRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef<StageLive>({ p: 0, amp: 0, playing: false });

  const current = utterances[idx] ?? null;
  const last = utterances.length - 1;

  const setIdx = useCallback((i: number) => setIdxRaw(Math.max(0, Math.min(last, i))), [last]);

  const [mode, setMode] = useState<"route" | "static" | null>(null);
  const [providers, setProviders] = useState<Record<string, AudioProvider>>({});
  const [usage, setUsage] = useState<VoiceUsage | null>(null);
  const providersRef = useRef(providers);
  providersRef.current = providers;
  const prefetched = useRef(new Set<string>());
  /** Utterance whose audio has started; prefetch waits for it so it never delays a first play. */
  const [heard, setHeard] = useState<string | null>(null);
  const enc = encodeURIComponent(runId);

  const learn = useCallback((id: string, p: string | null) => {
    if (p !== "elevenlabs" && p !== "azure") return;
    setProviders((prev) => (prev[id] === p ? prev : { ...prev, [id]: p }));
  }, []);

  const refreshUsage = useCallback(async () => {
    const r = await fetch("/api/tts/usage").catch(() => null);
    const b = (await r?.json().catch(() => null)) as ({ available?: boolean } & VoiceUsage) | null;
    if (b?.available) setUsage({ tier: b.tier, used: b.used, limit: b.limit });
  }, []);

  useEffect(() => {
    let alive = true;
    setAudioState("loading");
    setMode(null);
    setManifest(null);
    setEleven(null);
    setProviders({});
    prefetched.current = new Set();
    const manifestAt = async (name: string) => {
      const r = await fetch(`/stage/${enc}/${lang}/${name}`, { cache: "no-store" }).catch(
        () => null,
      );
      if (!r?.ok) return null;
      const m = (await r.json().catch(() => null)) as AudioManifest | null;
      return m && Object.keys(m.files ?? {}).length > 0 ? m : null;
    };
    void (async () => {
      const [res, az, el] = await Promise.all([
        fetch(`/api/runs/${enc}/tts?lang=${lang}`, { cache: "no-store" }).catch(() => null),
        manifestAt("manifest.json"),
        manifestAt(EL_MANIFEST),
      ]);
      const body = res?.ok
        ? ((await res.json().catch(() => null)) as { state?: string; live?: boolean } | null)
        : null;
      if (!alive) return;
      setManifest(az);
      setEleven(el);
      // the route serves cached files even without keys, so it wins whenever it answers
      const m = body && (body.live || az || el) ? "route" : !body && (az || el) ? "static" : null;
      setMode(m);
      setAudioState(m ? "on" : "off");
      if (m === "route") void refreshUsage();
    })();
    return () => {
      alive = false;
    };
  }, [lang, enc, refreshUsage]);

  /** URL that plays `u`, or null when it plays silent. */
  const srcFor = useCallback(
    (u: Utterance | null) => {
      if (!u || !mode) return null;
      if (mode === "route") return `/api/runs/${enc}/tts/${encodeURIComponent(u.id)}?lang=${lang}`;
      const f = audioFileFor(u.id, manifest, eleven)?.file;
      return f ? `/stage/${enc}/${lang}/${f}` : null;
    },
    [mode, enc, lang, manifest, eleven],
  );
  /** Provider that voiced `u` as far as known (header, meta or manifest), else null. */
  const providerOf = useCallback(
    (u: Utterance | null): AudioProvider | null =>
      u ? (providers[u.id] ?? audioFileFor(u.id, manifest, eleven)?.provider ?? null) : null,
    [providers, manifest, eleven],
  );

  /** Asks the route who voiced `id` (no rendering); retries while a render is running. */
  const askProvider = useCallback(
    async (id: string, tries = 6) => {
      for (let t = 0; t < tries; t++) {
        const r = await fetch(
          `/api/runs/${enc}/tts/${encodeURIComponent(id)}?lang=${lang}&meta=1`,
        ).catch(() => null);
        const b = (await r?.json().catch(() => null)) as { provider?: string | null } | null;
        if (b?.provider) {
          learn(id, b.provider);
          return;
        }
        await new Promise((res) => setTimeout(res, 1200));
      }
    },
    [enc, lang, learn],
  );

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio();
    el.preload = "auto";
    audioRef.current = el;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        const src = ctx.createMediaElementSource(el);
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        an.connect(ctx.destination);
        ctxRef.current = ctx;
        analyserRef.current = an;
      }
    } catch {
      // No analyser: audio still plays, mouth falls back to the synthetic envelope.
    }
    return el;
  }, []);

  const writeAmp = useCallback(
    (a: number) => {
      liveRef.current.amp = a;
      rootRef.current?.style.setProperty("--amp", a.toFixed(3));
    },
    [rootRef],
  );

  // New utterance: reset the clock and load its audio, if any.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on index/lang change only
  useEffect(() => {
    elapsedRef.current = 0;
    liveRef.current.p = 0;
    setSpoken(0);
    // the source is set when playback starts, so stepping through lines renders nothing
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
    }
  }, [idx, lang, mode]);

  const nextRef = useRef(nextOf);
  nextRef.current = nextOf;
  // While someone listens, voice the next two playlist entries ahead of time, starting once
  // the current line is audible.
  useEffect(() => {
    if (!playing || mode !== "route" || heard !== (utterances[idx]?.id ?? null)) return;
    const step = (i: number | null) =>
      i === null ? null : nextRef.current ? nextRef.current(i) : i < last ? i + 1 : null;
    const n1 = step(idx);
    const n2 = step(n1);
    const ahead = [n1, n2]
      .map((i) => (i === null ? null : (utterances[i] ?? null)))
      .filter((u): u is Utterance => !!u && !prefetched.current.has(u.id));
    if (ahead.length === 0) return;
    for (const u of ahead) prefetched.current.add(u.id);
    void (async () => {
      // one after the other: the free tier allows only a few concurrent requests
      for (const u of ahead) {
        const url = srcFor(u);
        if (!url) continue;
        const r = await fetch(url).catch(() => null);
        if (!r?.ok) {
          prefetched.current.delete(u.id);
          continue;
        }
        learn(u.id, r.headers.get("X-Voice-Provider"));
        await r.arrayBuffer().catch(() => null);
      }
    })();
  }, [playing, mode, heard, idx, last, utterances, srcFor, learn]);

  const advance = useCallback(() => {
    const i = idxRef.current;
    const n = nextRef.current ? nextRef.current(i) : i < last ? i + 1 : null;
    if (n === null || n > last) setPlaying(false);
    else setIdxRaw(n);
  }, [last]);

  useEffect(() => {
    liveRef.current.playing = playing && !!current;
    if (!playing || !current) {
      audioRef.current?.pause();
      writeAmp(0);
      return;
    }
    const text = textOf(current);
    const src = srcFor(current);
    const duration = silentDurationMs(text);
    const id = current.id;
    let raf = 0;
    let lastT = performance.now();
    let done = false;
    let el: HTMLAudioElement | null = null;
    let lastPos = -1;
    let lastMove = performance.now();
    const buf = new Uint8Array(1024);

    if (src) {
      el = ensureAudio();
      if (!el.src.endsWith(src)) el.src = src;
      el.playbackRate = speed;
      void ctxRef.current?.resume();
      el.onplaying = () => {
        setHeard(id);
        if (mode === "route" && !providersRef.current[id]) void askProvider(id);
      };
      el.onended = () => {
        done = true;
        if (mode === "route") void refreshUsage();
        window.setTimeout(advance, 450 / speed);
      };
      // A failed or stalled file must never stop the stage: fall back to silent timing.
      const toSilent = () => {
        if (done || !el) return;
        el.pause();
        el = null;
        setHeard(id);
      };
      el.onerror = toSilent;
      el.play().catch(() => {
        // Autoplay blocked or file missing: fall back to silent timing for this one.
        toSilent();
      });
    }

    const setSpokenAt = (p: number) => {
      const pos = Math.min(text.length, Math.floor(p * text.length));
      const sp = text.indexOf(" ", pos);
      setSpoken(p >= 1 ? text.length : sp === -1 ? text.length : sp);
    };

    const tick = (now: number) => {
      const dt = now - lastT;
      lastT = now;
      if (done) return;
      if (el) {
        // watchdog: no progress for 8 s (network hiccup, broken stream) means carry on silently
        if (el.currentTime !== lastPos) {
          lastPos = el.currentTime;
          lastMove = now;
        } else if (now - lastMove > 8000) {
          el.pause();
          el = null;
          elapsedRef.current = (lastPos * 1000) / speed;
          raf = requestAnimationFrame(tick);
          return;
        }
        // a freshly streamed render has no duration until it ends: estimate from the text
        const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        const p = d ? el.currentTime / d : Math.min(0.97, (el.currentTime * 1000) / duration);
        let amp = 0;
        const an = analyserRef.current;
        if (an) {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < an.fftSize; i++) {
            const v = ((buf[i] ?? 128) - 128) / 128;
            sum += v * v;
          }
          amp = Math.min(1, Math.sqrt(sum / an.fftSize) * 4.5);
        } else {
          amp = syntheticAmplitude(text, p, now);
        }
        writeAmp(amp);
        liveRef.current.p = p;
        setSpokenAt(p);
      } else {
        elapsedRef.current += dt * speed;
        const p = elapsedRef.current / duration;
        writeAmp(syntheticAmplitude(text, Math.min(1, p * 1.08), now));
        liveRef.current.p = Math.min(1, p * 1.08);
        setSpokenAt(Math.min(1, p * 1.08));
        if (p >= 1) {
          done = true;
          writeAmp(0);
          advance();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (el) {
        el.onended = null;
        el.onplaying = null;
        el.pause();
      }
      liveRef.current.playing = false;
      writeAmp(0);
    };
  }, [
    playing,
    current,
    speed,
    textOf,
    srcFor,
    mode,
    ensureAudio,
    advance,
    writeAmp,
    askProvider,
    refreshUsage,
  ]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      void ctxRef.current?.close();
    },
    [],
  );

  return {
    idx,
    setIdx,
    current,
    playing,
    setPlaying,
    toggle: () => setPlaying((p) => !p),
    speed,
    setSpeed,
    spoken,
    audioState,
    manifest,
    eleven,
    mode,
    usage,
    provider: providerOf(current),
    liveRef,
  };
}
