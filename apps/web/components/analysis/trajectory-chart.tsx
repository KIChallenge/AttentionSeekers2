"use client";

import { positionAt, type Run, type RunSnapshot } from "@sv/contracts";
import { useEffect, useMemo, useState } from "react";
import { Seg, Tile, UttRef } from "@/components/run/bits";
import { agentLook, fmtStance, L } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { cn } from "@/lib/utils";

/** Axis coordinate = weighted mean of topic stances (Axis.topicWeights), null if no data. */
export function axisPoint(
  snap: RunSnapshot,
  run: Run,
  agentId: string,
  round: number,
): { x: number; y: number } | null {
  const coord = (weights: Record<string, number>) => {
    let sum = 0;
    let w = 0;
    for (const [topicId, weight] of Object.entries(weights)) {
      const p = positionAt(snap, agentId, topicId, round);
      if (!p) continue;
      sum += p.stance * weight;
      w += weight;
    }
    return w > 0 ? sum / w : null;
  };
  const x = coord(run.mandate.axes[0].topicWeights);
  const y = coord(run.mandate.axes[1].topicWeights);
  return x === null || y === null ? null : { x, y };
}

const W = 760;
const H = 460;
const M = { l: 56, r: 24, t: 24, b: 56 };
const sx = (v: number) => M.l + ((v + 2) / 4) * (W - M.l - M.r);
const sy = (v: number) => H - M.b - ((v + 2) / 4) * (H - M.t - M.b);

/** Position-space trajectory (FR-U3): custom SVG, focus-dim, round scrubber, direct labels. */
export function TrajectoryChart() {
  const { snap, run, t, lang } = useRun();
  const maxRound = Math.max(1, snap.summaries.length, snap.currentRound);
  const [round, setRound] = useState(maxRound);
  const [focus, setFocus] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setRound(maxRound), [maxRound]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setRound((r) => {
        if (r >= maxRound) {
          setPlaying(false);
          return r;
        }
        return r + 1;
      });
    }, 900);
    return () => clearInterval(id);
  }, [playing, maxRound]);

  const paths = useMemo(
    () =>
      run.agents.map((a) => ({
        id: a.id,
        pts: Array.from({ length: maxRound }, (_, i) => axisPoint(snap, run, a.id, i + 1)),
      })),
    [snap, run, maxRound],
  );

  // Largest single step up to the selected round, with its trigger (annotation line).
  const annotation = useMemo(() => {
    let best: { agentId: string; round: number; d: number; trigger: string | null } | null = null;
    for (const a of run.agents) {
      for (const list of Object.values(snap.positions[a.id] ?? {})) {
        for (let i = 1; i < list.length; i++) {
          const p = list[i];
          const q = list[i - 1];
          if (!p || !q || p.round > round) continue;
          const d = Math.abs(p.stance - q.stance);
          if (!best || d > best.d)
            best = { agentId: a.id, round: p.round, d, trigger: p.trigger?.utteranceId ?? null };
        }
      }
    }
    return best;
  }, [snap, run, round]);

  const [ax, ay] = run.mandate.axes;
  // Label collision nudging: push labels down when two end points are closer than 14px.
  const labels = paths
    .map((p) => {
      const pt = p.pts.slice(0, round).filter(Boolean).at(-1) ?? null;
      return pt ? { id: p.id, x: sx(pt.x) + 8, y: sy(pt.y) + 4 } : null;
    })
    .filter((l): l is { id: string; x: number; y: number } => !!l)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    const a = labels[i - 1];
    const b = labels[i];
    if (a && b && Math.abs(a.x - b.x) < 40 && b.y - a.y < 13) b.y = a.y + 13;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">{t.analysis.round}</span>
        <Seg
          label={t.analysis.round}
          value={round}
          onChange={(r) => {
            setPlaying(false);
            setRound(r);
          }}
          options={Array.from({ length: maxRound }, (_, i) => ({ value: i + 1, label: i + 1 }))}
        />
        <button
          type="button"
          onClick={() => {
            if (round >= maxRound) setRound(1);
            setPlaying((p) => !p);
          }}
          className="h-7 rounded-control border px-2.5 text-xs hover:border-foreground/40"
        >
          {playing ? "❚❚" : `▶ ${t.analysis.play}`}
        </button>
        <span className="text-xs text-muted-foreground">
          {t.analysis.historical}: {t.analysis.historicalNone}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto max-h-[600px] w-full"
        role="img"
        aria-label={t.analysis.trajectory}
      >
        {[-2, -1, 0, 1, 2].map((v) => (
          <g key={v}>
            <line
              x1={sx(v)}
              x2={sx(v)}
              y1={sy(-2)}
              y2={sy(2)}
              className={v === 0 ? "stroke-gray-alpha-400" : "stroke-gray-alpha-150"}
            />
            <line
              x1={sx(-2)}
              x2={sx(2)}
              y1={sy(v)}
              y2={sy(v)}
              className={v === 0 ? "stroke-gray-alpha-400" : "stroke-gray-alpha-150"}
            />
            <text
              x={sx(v)}
              y={sy(-2) + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {fmtStance(v)}
            </text>
            <text
              x={M.l - 8}
              y={sy(v) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {fmtStance(v)}
            </text>
          </g>
        ))}
        <text x={sx(-2)} y={H - 12} className="fill-muted-foreground text-[13px]">
          ◀ {L(ax.poles[0], lang)}
        </text>
        <text x={sx(2)} y={H - 12} textAnchor="end" className="fill-muted-foreground text-[13px]">
          {L(ax.poles[1], lang)} ▶
        </text>
        <text x={sx(-2) + 8} y={sy(2) + 16} className="fill-muted-foreground text-[13px]">
          ▲ {L(ay.poles[1], lang)}
        </text>
        <text x={sx(-2) + 8} y={sy(-2) - 8} className="fill-muted-foreground text-[13px]">
          ▼ {L(ay.poles[0], lang)}
        </text>
        {paths.map((p) => {
          const a = agentLook(run, p.id, lang);
          const pts = p.pts.slice(0, round);
          const valid = pts.filter((x): x is { x: number; y: number } => !!x);
          if (!valid.length) return null;
          const dim = focus !== null && focus !== p.id;
          const d = valid.map((pt, i) => `${i ? "L" : "M"}${sx(pt.x)},${sy(pt.y)}`).join(" ");
          return (
            <g
              key={p.id}
              style={{ color: a.color, opacity: dim ? 0.15 : 1 }}
              className="transition-opacity"
            >
              <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth={focus === p.id ? 3 : 2}
                strokeDasharray={p.id === "fm" ? "5 3" : undefined}
              />
              {valid.map((pt, i) => (
                <circle
                  // biome-ignore lint/suspicious/noArrayIndexKey: points are ordered by round
                  key={i}
                  cx={sx(pt.x)}
                  cy={sy(pt.y)}
                  r={i === 0 || i === valid.length - 1 ? 5 : 2.5}
                  fill={i === 0 ? "var(--background)" : "currentColor"}
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}
        {labels.map((l) => {
          const a = agentLook(run, l.id, lang);
          const dim = focus !== null && focus !== l.id;
          return (
            <text
              key={l.id}
              x={l.x}
              y={l.y}
              className="fill-foreground text-[12px] font-semibold"
              style={{ opacity: dim ? 0.2 : 1 }}
            >
              {a.code}
            </text>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={focus === null}
          onClick={() => setFocus(null)}
          className={cn(
            "h-7 rounded-control border px-2.5 text-xs",
            focus === null && "bg-gray-alpha-150",
          )}
        >
          {t.analysis.all}
        </button>
        {run.agents.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={focus === a.id}
            onClick={() => setFocus(focus === a.id ? null : a.id)}
            className={cn(
              "inline-flex h-7 items-center rounded-control border px-2 text-xs",
              focus === a.id && "border-foreground bg-gray-alpha-100",
            )}
          >
            <Tile id={a.id} withName className="[&>span:last-child]:text-xs" />
          </button>
        ))}
      </div>
      {annotation ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">
            {t.analysis.annotation} R{annotation.round}:
          </span>{" "}
          <Tile id={annotation.agentId} withName /> {fmtStance(annotation.d).replace("+", "Δ ")}
          {annotation.trigger ? (
            <>
              {" "}
              · {t.agent.trigger} <UttRef id={annotation.trigger} />
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
