"use client";

import { emptySnapshot, NdjsonBuffer, RunEvent, type RunSnapshot, reduceRun } from "@sv/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

export type StreamState = "idle" | "streaming" | "done" | "error";

/**
 * Streams /api/runs/[runId]/stream into a RunSnapshot via the shared reducer.
 * Out-of-order lines throw (RunSequenceError) and end the stream with an error.
 */
export function useRunStream(runId: string, opts: { speed?: number; autoStart?: boolean } = {}) {
  const { speed = 1, autoStart = true } = opts;
  const [snapshot, setSnapshot] = useState<RunSnapshot>(emptySnapshot);
  const [state, setState] = useState<StreamState>("idle");
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const snapRef = useRef(snapshot);

  const start = useCallback(
    async (fromSnapshot?: RunSnapshot) => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      let snap = fromSnapshot ?? emptySnapshot();
      snapRef.current = snap;
      setSnapshot(snap);
      setError(null);
      setState("streaming");
      try {
        const res = await fetch(
          `/api/runs/${encodeURIComponent(runId)}/stream?from=${snap.lastSeq + 1}&speed=${speed}`,
          { signal: ctl.signal, cache: "no-store" },
        );
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const buffer = new NdjsonBuffer();
        while (true) {
          const { done, value } = await reader.read();
          const records = buffer.push(decoder.decode(value, { stream: !done }), done);
          if (records.length) {
            for (const r of records) snap = reduceRun(snap, RunEvent.parse(r));
            snapRef.current = snap;
            setSnapshot(snap);
          }
          if (done) break;
        }
        setState("done");
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    },
    [runId, speed],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    setState("idle");
  }, []);

  /** Continue from the current snapshot (used after pause or a speed change). */
  const resume = useCallback(() => start(snapRef.current), [start]);

  useEffect(() => {
    if (autoStart) void start();
    return () => abort.current?.abort();
  }, [autoStart, start]);

  return { snapshot, state, error, start, stop, resume };
}
