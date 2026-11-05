"use client";

import type { CoalitionCalculus } from "@sv/contracts";
import { useState } from "react";
import { Chip, Seg, Tile } from "@/components/run/bits";
import { agentLook, L } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { cn } from "@/lib/utils";

function useCalculus() {
  const { snap } = useRun();
  const rounds = snap.calculi.map((c) => c.round);
  const [round, setRound] = useState<number | null>(null);
  const r = round ?? rounds[rounds.length - 1] ?? null;
  const calc: CoalitionCalculus | null = snap.calculi.find((c) => c.round === r) ?? null;
  return { calc, rounds, round: r, setRound };
}

/** Coalition graph (FR-A6, FR-A11): agents on a circle, coalitions as edges, veto rings. */
export function CoalitionGraph() {
  const { run, t, lang } = useRun();
  const { calc, rounds, round, setRound } = useCalculus();
  if (!calc) return <p className="text-sm text-muted-foreground">{t.analysis.noData}</p>;
  const W = 420;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const R = 140;
  const ids = run.agents.map((a) => a.id);
  const pos = Object.fromEntries(
    ids.map((id, i) => {
      const ang = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
      return [id, { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) }];
    }),
  );
  const style = {
    supporting: { stroke: "var(--success)", dash: undefined },
    blocking: { stroke: "var(--warning)", dash: "6 4" },
    alignment: { stroke: "var(--gray-alpha-500)", dash: "2 4" },
  } as const;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t.analysis.round}</span>
        {round !== null ? (
          <Seg
            label={t.analysis.round}
            value={round}
            onChange={setRound}
            options={rounds.map((r) => ({ value: r, label: r }))}
          />
        ) : null}
        <span className="text-xs text-muted-foreground">
          {t.analysis.rule_[calc.decisionRule]} · {t.analysis.quorum} {calc.quorum.needed}/
          {calc.quorum.of}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-[520px]"
        role="img"
        aria-label={t.analysis.coalitionGraph}
      >
        {calc.coalitions.map((c) => {
          const st = style[c.kind];
          const edges: Array<[string, string]> = [];
          for (let i = 0; i < c.members.length; i++)
            for (let j = i + 1; j < c.members.length; j++) {
              const a = c.members[i];
              const b = c.members[j];
              if (a && b) edges.push([a, b]);
            }
          return edges.map(([a, b]) => {
            const p = pos[a];
            const q = pos[b];
            if (!p || !q) return null;
            return (
              <line
                key={`${c.id}-${a}-${b}`}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke={st.stroke}
                strokeWidth={2}
                strokeDasharray={st.dash}
                opacity={0.8}
              >
                <title>{L(c.note, lang)}</title>
              </line>
            );
          });
        })}
        {ids.map((id) => {
          const p = pos[id];
          if (!p) return null;
          const a = agentLook(run, id, lang);
          const veto = calc.vetoPlayers.includes(id);
          return (
            <g key={id}>
              {veto ? (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={22}
                  fill="none"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  strokeDasharray="3 2"
                />
              ) : null}
              <circle cx={p.x} cy={p.y} r={16} fill={a.color} />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                className="fill-white text-[11px] font-semibold"
              >
                {a.code}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-0.5 w-5 bg-success" /> {t.analysis.supporting}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-0 w-5 border-t-2 border-dashed border-warning" />{" "}
          {t.analysis.blocking}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-3 rounded-full border-2 border-dashed border-foreground" />{" "}
          {t.analysis.vetoPlayer}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {calc.coalitions.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-1.5">
            <Chip
              className={cn(
                c.kind === "supporting" && "border-success/30 text-success",
                c.kind === "blocking" && "border-warning/40 text-warning",
              )}
            >
              {t.analysis[c.kind]}
            </Chip>
            {c.members.map((m) => (
              <Tile key={m} id={m} />
            ))}
            <span className="text-muted-foreground">{L(c.note, lang)}</span>
          </li>
        ))}
      </ul>
      {calc.nextTabled ? (
        <p className="mt-3 rounded-xl border bg-gray-alpha-50 p-2.5 text-xs">
          <span className="font-medium">{t.analysis.nextTabled}:</span>{" "}
          <span className="font-mono">{calc.nextTabled.proposalId}</span> ·{" "}
          {L(calc.nextTabled.reason, lang)}
        </p>
      ) : null}
    </div>
  );
}

/** Incentive matrix (FR-A11): proposal rows by institution, payoff sign, veto, MWC, blockers. */
export function IncentiveMatrix() {
  const { snap, run, t, lang } = useRun();
  // Latest calculus row per proposal across rounds.
  const rows = new Map<string, { round: number; row: CoalitionCalculus["proposals"][number] }>();
  for (const c of snap.calculi)
    for (const p of c.proposals) rows.set(p.proposalId, { round: c.round, row: p });
  const veto = new Set(snap.calculi.at(-1)?.vetoPlayers ?? []);
  if (!rows.size) return <p className="text-sm text-muted-foreground">{t.analysis.noData}</p>;
  const sign = (v: number | undefined) => (v === 1 ? "+" : v === -1 ? "−" : v === 0 ? "0" : "·");
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card text-left text-xs font-normal text-muted-foreground">
              {t.analysis.proposal}
            </th>
            {run.agents.map((a) => (
              <th key={a.id} className="text-center font-normal">
                <span
                  className={cn(
                    "inline-flex rounded-md p-0.5",
                    veto.has(a.id) && "ring-2 ring-foreground ring-offset-1 ring-offset-card",
                  )}
                  title={veto.has(a.id) ? t.analysis.vetoPlayer : undefined}
                >
                  <Tile id={a.id} />
                </span>
              </th>
            ))}
            <th className="text-left text-xs font-normal text-muted-foreground">
              {t.analysis.status}
            </th>
            <th className="text-left text-xs font-normal text-muted-foreground">
              {t.analysis.blockers}
            </th>
            <th className="text-left text-xs font-normal text-muted-foreground">
              {t.analysis.mwc}
            </th>
          </tr>
        </thead>
        <tbody>
          {[...rows.entries()].map(([pid, { round, row }]) => {
            const p = snap.proposals[pid];
            return (
              <tr key={pid}>
                <td className="sticky left-0 max-w-[240px] bg-card pr-2 align-top">
                  <span className="font-mono text-xs text-muted-foreground">
                    {pid} · R{round}
                  </span>
                  <div className="text-xs leading-snug">{p ? L(p.title, lang) : null}</div>
                </td>
                {run.agents.map((a) => {
                  const v = row.payoffs[a.id];
                  const stance = row.supporters.includes(a.id)
                    ? "s"
                    : row.opponents.includes(a.id)
                      ? "o"
                      : row.conditional.includes(a.id)
                        ? "c"
                        : "";
                  return (
                    <td
                      key={a.id}
                      title={`${stance === "s" ? t.analysis.supporters : stance === "o" ? t.analysis.opponents : stance === "c" ? t.analysis.conditional : ""}`}
                      className={cn(
                        "num h-9 w-12 rounded-md text-center font-semibold",
                        v === 1 && "bg-success/15 text-success",
                        v === -1 && "bg-warning/15 text-warning",
                        v === 0 && "bg-gray-alpha-50 text-muted-foreground",
                        stance === "o" && "ring-1 ring-warning/60",
                        stance === "s" && "ring-1 ring-success/50",
                        stance === "c" && "ring-1 ring-dashed ring-foreground/30",
                      )}
                    >
                      {sign(v)}
                    </td>
                  );
                })}
                <td className="align-middle">
                  <Chip
                    className={
                      row.passes
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-warning/40 text-warning"
                    }
                  >
                    {row.passes ? t.analysis.passes : t.analysis.fails}
                  </Chip>
                  {row.missingVetoPlayers.length ? (
                    <div
                      className="mt-0.5 flex items-center gap-0.5 whitespace-nowrap text-[10px] text-muted-foreground"
                      title={t.analysis.missingVeto}
                    >
                      {lang === "de" ? "fehlt" : "missing"}:
                      {row.missingVetoPlayers.map((m) => (
                        <Tile key={m} id={m} />
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="align-middle">
                  <div className="flex flex-wrap gap-0.5">
                    {row.blockers.map((b) => (
                      <Tile key={b} id={b} />
                    ))}
                    {row.blockers.length === 0 ? (
                      <span className="text-xs text-muted-foreground">·</span>
                    ) : null}
                  </div>
                </td>
                <td className="align-middle text-xs">
                  {row.minimalWinningCoalitions.length ? (
                    <div className="space-y-0.5">
                      {row.minimalWinningCoalitions.slice(0, 2).map((m) => (
                        <div key={m.join("-")} className="flex flex-wrap gap-0.5">
                          {m.map((x) => (
                            <Tile key={x} id={x} />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">·</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        + / 0 / − = {lang === "de" ? "Nutzen, neutral, Schaden" : "benefit, neutral, harm"} ·{" "}
        {lang === "de"
          ? "Rahmen = Haltung (grün dafür, orange dagegen, gestrichelt bedingt)"
          : "outline = stance (green for, orange against, dashed conditional)"}{" "}
        · {t.analysis.vetoPlayer} ◯
      </p>
    </div>
  );
}
