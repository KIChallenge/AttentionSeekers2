"use client";

import type { RunEvent } from "@sv/contracts";
import { useMemo, useRef } from "react";
import { Playhead } from "@/components/playback/controls";
import { cn } from "@/lib/utils";

export interface ScrubMarks {
  rounds: Array<{ idx: number; tMs: number; round: number }>;
  changes: Array<{ idx: number; tMs: number; agentId: string; color: string }>;
  utterances: Array<{ idx: number; tMs: number; id: string }>;
  injections: Array<{ idx: number; tMs: number }>;
}

export function buildMarks(events: RunEvent[], colorOf: (agentId: string) => string): ScrubMarks {
  const m: ScrubMarks = { rounds: [], changes: [], utterances: [], injections: [] };
  events.forEach((e, idx) => {
    if (e.type === "round.started") m.rounds.push({ idx, tMs: e.tMs, round: e.round });
    else if (e.type === "position.updated" && e.position.trigger)
      m.changes.push({
        idx,
        tMs: e.tMs,
        agentId: e.position.agentId,
        color: colorOf(e.position.agentId),
      });
    else if (e.type === "utterance.completed")
      m.utterances.push({ idx, tMs: e.tMs, id: e.utterance.id });
    else if (e.type === "room.event_injected") m.injections.push({ idx, tMs: e.tMs });
  });
  return m;
}

/**
 * Timeline over the run's recorded time: round markers (labelled), position-change ticks
 * in the agent hue (above the track), utterance ticks (below), injected events (diamond).
 * Click or drag to seek; the value is an event index.
 */
export function Scrubber({
  events,
  marks,
  pos,
  onSeek,
  labels,
}: {
  events: RunEvent[];
  marks: ScrubMarks;
  pos: number;
  onSeek: (idx: number) => void;
  labels: { round: string; change: string; injected: string; timeline?: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const total = Math.max(1, events.at(-1)?.tMs ?? 1);
  const times = useMemo(() => events.map((e) => e.tMs), [events]);
  const pct = (t: number) => `${(t / total) * 100}%`;
  const curT = events[Math.max(0, pos - 1)]?.tMs ?? 0;

  const seekAt = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * total;
    // last event at or before t
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((times[mid] ?? 0) <= t) lo = mid;
      else hi = mid - 1;
    }
    onSeek(lo + 1);
  };

  return (
    <div className="select-none">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={events.length}
        aria-valuenow={pos}
        aria-valuetext={`${pos} / ${events.length}`}
        aria-label={labels.timeline ?? "Timeline"}
        className="relative h-16 cursor-pointer touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          seekAt(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekAt(e.clientX);
        }}
      >
        {/* round bands */}
        {marks.rounds.map((r, i) => {
          const end = marks.rounds[i + 1]?.tMs ?? total;
          return (
            <div
              key={r.idx}
              className={cn("absolute top-5 h-4", i % 2 ? "bg-gray-alpha-100" : "bg-gray-alpha-50")}
              style={{ left: pct(r.tMs), width: `calc(${pct(end - r.tMs)})` }}
            />
          );
        })}
        {/* progress */}
        <div className="absolute top-5 left-0 h-4 bg-foreground/15" style={{ width: pct(curT) }} />
        {/* position-change ticks above */}
        {marks.changes.map((c) => (
          <span
            key={c.idx}
            title={`${labels.change}: ${c.agentId}`}
            className="absolute top-1 h-3.5 w-[3px] -translate-x-1/2 rounded-full"
            style={{ left: pct(c.tMs), background: c.color, opacity: c.idx < pos ? 1 : 0.35 }}
          />
        ))}
        {/* utterance ticks below */}
        {marks.utterances.map((u) => (
          <span
            key={u.idx}
            className={cn(
              "absolute top-[38px] h-2 w-px -translate-x-1/2",
              u.idx < pos ? "bg-foreground/70" : "bg-gray-alpha-400",
            )}
            style={{ left: pct(u.tMs) }}
          />
        ))}
        {marks.injections.map((u) => (
          <span
            key={u.idx}
            title={labels.injected}
            className="absolute top-[22px] size-2.5 -translate-x-1/2 rotate-45 border border-warning bg-warning/30"
            style={{ left: pct(u.tMs) }}
          />
        ))}
        {/* round markers */}
        {marks.rounds.map((r) => (
          <span
            key={`m${r.idx}`}
            className="absolute top-4 h-6 w-px bg-foreground/60"
            style={{ left: pct(r.tMs) }}
          >
            <span className="absolute top-8 left-1 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
              {labels.round} {r.round}
            </span>
          </span>
        ))}
        {/* playhead */}
        <Playhead left={pct(curT)} className="top-2 bottom-4" />
      </div>
    </div>
  );
}
