"use client";

import { emptySnapshot, type Lang, type Run, type RunSnapshot } from "@sv/contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { usePrefs } from "@/components/shell/providers";
import { type StreamState, useRunStream } from "@/lib/use-run-stream";
import type { Evidence } from "./evidence";
import { type RunStrings, runStrings } from "./strings";

interface RunCtx {
  runId: string;
  snap: RunSnapshot;
  /** Run config from the server snapshot; stable while a replay starts from zero. */
  run: Run;
  evidence: Evidence;
  lang: Lang;
  t: RunStrings;
  /** True while this tab is folding the stream itself (live tail or "play live"). */
  streaming: boolean;
  streamState: StreamState;
  streamError: string | null;
  speed: number;
  setSpeed: (s: number) => void;
  /** Re-plays the run from seq 0 through the stream route (demo of the live view). */
  playLive: () => void;
  stop: () => void;
}

const Ctx = createContext<RunCtx | null>(null);

/**
 * One snapshot for every run screen. The server folds the stored events (finished run, or
 * the prefix of a running one); a running run then continues from lastSeq + 1 through
 * GET /api/runs/[runId]/stream with the same reducer.
 */
export function RunProvider({
  runId,
  initial,
  evidence,
  children,
}: {
  runId: string;
  initial: RunSnapshot & { run: Run };
  evidence: Evidence;
  children: ReactNode;
}) {
  const { lang } = usePrefs();
  const [speed, setSpeed] = useState(4);
  const [mode, setMode] = useState<"static" | "tail" | "replay">("static");
  const stream = useRunStream(runId, { speed, autoStart: false });
  const { start, stop: stopStream } = stream;

  // Live tail: a run that is still running continues from where the server stopped.
  useEffect(() => {
    if (initial.status === "running" && mode === "static") {
      setMode("tail");
      void start(initial);
    }
  }, [initial, mode, start]);

  const playLive = useCallback(() => {
    setMode("replay");
    void start(emptySnapshot());
  }, [start]);

  const stop = useCallback(() => {
    stopStream();
    setMode("static");
  }, [stopStream]);

  // A speed change restarts the hook's start(); continue from the current snapshot.
  const changeSpeed = useCallback((s: number) => setSpeed(s), []);

  const streaming = mode !== "static";
  const snap = streaming && stream.snapshot.lastSeq >= 0 ? stream.snapshot : initial;
  const value: RunCtx = {
    runId,
    snap: mode === "replay" && stream.snapshot.lastSeq < 0 ? emptySnapshot() : snap,
    run: initial.run,
    evidence,
    lang,
    t: runStrings[lang],
    streaming,
    streamState: stream.state,
    streamError: stream.error,
    speed,
    setSpeed: changeSpeed,
    playLive,
    stop,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRun(): RunCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRun outside RunProvider");
  return c;
}

/** Strings and language only; usable outside a RunProvider. */
export function useRunStrings(): { t: RunStrings; lang: Lang } {
  const { lang } = usePrefs();
  return { t: runStrings[lang], lang };
}
