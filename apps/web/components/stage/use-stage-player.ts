"use client";

import type { Utterance } from "@sv/contracts";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type AudioManifest, silentDurationMs, syntheticAmplitude } from "./stage-logic";

export type AudioState = "loading" | "on" | "off";

/**
 * Plays utterances one after another. With a pre-rendered manifest (FR-S3) each utterance is
 * an audio file routed through a Web Audio analyser whose RMS drives the mouth bars; without
 * one, playback is silent and timed by text length with a synthetic envelope. Amplitude goes
 * straight into the CSS variable --amp on `rootRef`, progress into state at word steps.
 * The browser Web Speech API is never used.
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
  const [audioState, setAudioState] = useState<AudioState>("loading");

  const elapsedRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const current = utterances[idx] ?? null;
  const last = utterances.length - 1;

  const setIdx = useCallback((i: number) => setIdxRaw(Math.max(0, Math.min(last, i))), [last]);

  // Manifest per run and language; a 404 means "no sound" and the stage says so.
  useEffect(() => {
    let alive = true;
    setAudioState("loading");
    fetch(`/stage/${encodeURIComponent(runId)}/${lang}/manifest.json`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AudioManifest>) : null))
      .then((m) => {
        if (!alive) return;
        const ok = !!m && Object.keys(m.files ?? {}).length > 0;
        setManifest(ok ? m : null);
        setAudioState(ok ? "on" : "off");
      })
      .catch(() => {
        if (alive) {
          setManifest(null);
          setAudioState("off");
        }
      });
    return () => {
      alive = false;
    };
  }, [runId, lang]);

  const fileFor = useCallback(
    (u: Utterance | null) => (u && manifest ? (manifest.files[u.id] ?? null) : null),
    [manifest],
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
    (a: number) => rootRef.current?.style.setProperty("--amp", a.toFixed(3)),
    [rootRef],
  );

  // New utterance: reset the clock and load its audio, if any.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on index/lang change only
  useEffect(() => {
    elapsedRef.current = 0;
    setSpoken(0);
    const file = fileFor(current);
    const el = audioRef.current;
    if (el) {
      el.pause();
      if (file) el.src = `/stage/${encodeURIComponent(runId)}/${lang}/${file}`;
      else el.removeAttribute("src");
    }
  }, [idx, lang, manifest]);

  const nextRef = useRef(nextOf);
  nextRef.current = nextOf;
  const advance = useCallback(() => {
    const i = idxRef.current;
    const n = nextRef.current ? nextRef.current(i) : i < last ? i + 1 : null;
    if (n === null || n > last) setPlaying(false);
    else setIdxRaw(n);
  }, [last]);

  useEffect(() => {
    if (!playing || !current) {
      audioRef.current?.pause();
      writeAmp(0);
      return;
    }
    const text = textOf(current);
    const file = fileFor(current);
    const duration = silentDurationMs(text);
    let raf = 0;
    let lastT = performance.now();
    let done = false;
    let el: HTMLAudioElement | null = null;
    const buf = new Uint8Array(1024);

    if (file) {
      el = ensureAudio();
      const want = `/stage/${encodeURIComponent(runId)}/${lang}/${file}`;
      if (!el.src.endsWith(want)) el.src = want;
      el.playbackRate = speed;
      void ctxRef.current?.resume();
      el.onended = () => {
        done = true;
        window.setTimeout(advance, 450 / speed);
      };
      el.play().catch(() => {
        // Autoplay blocked or file missing: fall back to silent timing for this one.
        el = null;
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
        const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        const p = d ? el.currentTime / d : 0;
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
        setSpokenAt(p);
      } else {
        elapsedRef.current += dt * speed;
        const p = elapsedRef.current / duration;
        writeAmp(syntheticAmplitude(text, Math.min(1, p * 1.08), now));
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
        el.pause();
      }
      writeAmp(0);
    };
  }, [playing, current, speed, runId, lang, textOf, fileFor, ensureAudio, advance, writeAmp]);

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
  };
}
