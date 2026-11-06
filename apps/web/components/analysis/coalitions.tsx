"use client";

import type { CoalitionCalculus } from "@sv/contracts";
import { useState } from "react";
import { Chip, Seg, Tile } from "@/components/run/bits";
import { agentLook, L } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { pairRelations, rankedPairs } from "@/lib/pair-relations";
import { cn } from "@/lib/utils";

function useCalculus() {
  const { snap } = useRun();
  const rounds = snap.calculi.map((c) => c.round);
  const [round, setRound] = useState<number | null>(null);
  const r = round ?? rounds[rounds.length - 1] ?? null;
  const calc: CoalitionCalculus | null = snap.calculi.find((c) => c.round === r) ?? null;
  return { calc, rounds, round: r, setRound };
}

const KIND_STYLE = {
  supporting: { stroke: "var(--success)", dash: undefined },
  blocking: { stroke: "var(--warning)", dash: "6 4" },
  alignment: { stroke: "var(--gray-alpha-500)", dash: "2 4" },
} as const;

/** Distinct coalition colors for the detail view, readable in light and dark. */
const GROUP_COLORS = [
  "#0ea5e9",
  "#e11d48",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

/**
 * Agents on a circle, coalitions as edges between all members, veto players ringed. `big`
 * draws full institution names outside the circle; `colorBy` "group" gives every coalition
 * its own color (detail view), "kind" colors by supporting / blocking / alignment.
 */
function GraphSvg({
  calc,
  coalitions,
  big = false,
  colorBy = "kind",
  highlight = null,
}: {
  calc: CoalitionCalculus;
  coalitions: CoalitionCalculus["coalitions"];
  big?: boolean;
  colorBy?: "kind" | "group";
  highlight?: string | null;
}) {
  const { run, t, lang } = useRun();
  const W = big ? 760 : 420;
  const H = big ? 600 : 360;
  const cx = W / 2;
  const cy = H / 2;
  const R = big ? 210 : 140;
  const ids = run.agents.map((a) => a.id);
  const pos = Object.fromEntries(
    ids.map((id, i) => {
      const ang = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
      return [id, { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), ang }];
    }),
  );
  const colorOf = (c: CoalitionCalculus["coalitions"][number], i: number) =>
    colorBy === "group"
      ? (GROUP_COLORS[i % GROUP_COLORS.length] ?? "#0ea5e9")
      : KIND_STYLE[c.kind].stroke;
  const hlMembers = new Set(coalitions.find((c) => c.id === highlight)?.members ?? []);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("w-full", big ? "max-w-[900px]" : "max-w-[520px]")}
      role="img"
      aria-label={t.analysis.coalitionGraph}
    >
      {coalitions.map((c, ci) => {
        const edges: Array<[string, string]> = [];
        for (let i = 0; i < c.members.length; i++)
          for (let j = i + 1; j < c.members.length; j++) {
            const a = c.members[i];
            const b = c.members[j];
            if (a && b) edges.push([a, b]);
          }
        const dim = highlight !== null && highlight !== c.id;
        // in the detail view parallel groups are offset slightly so shared edges stay visible
        const off = colorBy === "group" ? (ci - (coalitions.length - 1) / 2) * 3 : 0;
        return edges.map(([a, b]) => {
          const p = pos[a];
          const q = pos[b];
          if (!p || !q) return null;
          const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          const nx = (-(q.y - p.y) / len) * off;
          const ny = ((q.x - p.x) / len) * off;
          return (
            <line
              key={`${c.id}-${a}-${b}`}
              x1={p.x + nx}
              y1={p.y + ny}
              x2={q.x + nx}
              y2={q.y + ny}
              stroke={colorOf(c, ci)}
              strokeWidth={big ? (highlight === c.id ? 4 : 2.5) : 2}
              strokeDasharray={colorBy === "group" ? undefined : KIND_STYLE[c.kind].dash}
              opacity={dim ? 0.12 : 0.85}
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
        const dim = highlight !== null && !hlMembers.has(id);
        const r = big ? 22 : 16;
        const lx = cx + (R + (big ? 44 : 0)) * Math.cos(p.ang);
        const ly = cy + (R + (big ? 44 : 0)) * Math.sin(p.ang);
        const anchor =
          Math.abs(Math.cos(p.ang)) < 0.2 ? "middle" : Math.cos(p.ang) > 0 ? "start" : "end";
        return (
          <g key={id} opacity={dim ? 0.3 : 1}>
            {veto ? (
              <circle
                cx={p.x}
                cy={p.y}
                r={r + 6}
                fill="none"
                stroke="var(--foreground)"
                strokeWidth={2}
                strokeDasharray="3 2"
              />
            ) : null}
            <circle cx={p.x} cy={p.y} r={r} fill={a.color} />
            <text
              x={p.x}
              y={p.y + (big ? 5 : 4)}
              textAnchor="middle"
              className={cn("fill-white font-semibold", big ? "text-[13px]" : "text-[11px]")}
            >
              {a.code}
            </text>
            {big ? (
              <text x={lx} y={ly + 4} textAnchor={anchor} className="fill-foreground text-[13px]">
                {a.name}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function KindLegend() {
  const { t } = useRun();
  return (
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
  );
}

/**
 * Who works with whom: per pair of institutions, topics on the same side (green) against
 * topics on opposite sides (red), at the chosen round; with a topic picked, that topic only.
 */
function PairMatrix({ round, topic }: { round: number; topic: string }) {
  const { run, snap, t, lang } = useRun();
  const ids = run.agents.map((a) => a.id);
  const topicIds = topic ? [topic] : run.mandate.topics.map((x) => x.id);
  const rel = pairRelations(snap, ids, topicIds, round);
  const pairs = rankedPairs(rel, ids);
  const allies = pairs.filter((p) => p.r.together > p.r.against).slice(0, 4);
  const rivals = pairs
    .filter((p) => p.r.against > p.r.together)
    .reverse()
    .slice(0, 4);
  const name = (id: string) => agentLook(run, id, lang).name;
  const cell = (r: { together: number; against: number; topics: number }) => {
    if (!r.topics) return { bg: "transparent", text: "" };
    const net = (r.together - r.against) / r.topics;
    const bg =
      net > 0
        ? `color-mix(in srgb, var(--success) ${Math.round(20 + net * 60)}%, transparent)`
        : net < 0
          ? `color-mix(in srgb, var(--destructive) ${Math.round(20 - net * 60)}%, transparent)`
          : "var(--gray-alpha-100)";
    return { bg, text: topic ? "" : `${r.together}:${r.against}` };
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {ids.map((b) => (
              <th key={b} className="font-normal">
                <Tile id={b} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((a) => (
            <tr key={a}>
              <th className="pr-1 font-normal">
                <Tile id={a} />
              </th>
              {ids.map((b) => {
                const r = rel[a]?.[b] ?? { together: 0, against: 0, topics: 0 };
                const c = cell(r);
                return (
                  <td
                    key={b}
                    className="num size-9 rounded-md text-center text-[10px]"
                    style={{ background: a === b ? "var(--gray-alpha-50)" : c.bg }}
                    title={
                      a === b
                        ? undefined
                        : `${name(a)} / ${name(b)}: ${t.analysis.pairTogether} ${r.together}, ${t.analysis.pairAgainst} ${r.against}`
                    }
                  >
                    {a === b ? "" : c.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid content-start gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-medium text-success">{t.analysis.allies}</div>
          <ul className="space-y-1.5 text-sm">
            {allies.map(({ a, b, r }) => (
              <li key={`${a}-${b}`} className="flex flex-wrap items-center gap-1.5">
                <Tile id={a} />
                <Tile id={b} />
                <span className="text-muted-foreground">
                  {r.together}/{r.topics}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-destructive">{t.analysis.rivals}</div>
          <ul className="space-y-1.5 text-sm">
            {rivals.map(({ a, b, r }) => (
              <li key={`${a}-${b}`} className="flex flex-wrap items-center gap-1.5">
                <Tile id={a} />
                <Tile id={b} />
                <span className="text-muted-foreground">
                  {r.against}/{r.topics}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Detail view: big graph, one topic at a time, each coalition in its own color. */
function CoalitionDetail() {
  const { run, t, lang } = useRun();
  const { calc, rounds, round, setRound } = useCalculus();
  const [picked, setTopic] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  if (!calc) return null;
  const topics = run.mandate.topics.filter((tp) =>
    calc.coalitions.some((c) => c.topicIds.includes(tp.id)),
  );
  // one topic at a time reads clearly; "all topics" stays one click away
  const topic = picked ?? topics[0]?.id ?? "";
  const shown = topic ? calc.coalitions.filter((c) => c.topicIds.includes(topic)) : calc.coalitions;
  const topicLabel = (id: string) => {
    const tp = run.mandate.topics.find((x) => x.id === id);
    return tp ? L(tp.label, lang) : id;
  };
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <GraphSvg calc={calc} coalitions={shown} big colorBy="group" highlight={hl} />
        </div>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {round !== null ? (
              <Seg
                label={t.analysis.round}
                value={round}
                onChange={(r) => {
                  setRound(r);
                  setHl(null);
                }}
                options={rounds.map((r) => ({ value: r, label: `${t.analysis.round} ${r}` }))}
              />
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {t.analysis.rule_[calc.decisionRule]} · {t.analysis.quorum} {calc.quorum.needed}/
            {calc.quorum.of}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "", label: t.analysis.allTopics },
              ...topics.map((tp) => ({ id: tp.id, label: L(tp.label, lang) })),
            ].map((x) => (
              <button
                key={x.id || "all"}
                type="button"
                onClick={() => {
                  setTopic(x.id);
                  setHl(null);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  topic === x.id
                    ? "border-foreground bg-foreground text-background"
                    : "hover:border-foreground/40",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          <ul className="space-y-2 text-sm">
            {shown.map((c, i) => (
              <li
                key={c.id}
                onMouseEnter={() => setHl(c.id)}
                onMouseLeave={() => setHl(null)}
                className={cn(
                  "rounded-xl border p-2.5 outline-none transition-colors",
                  hl === c.id && "border-foreground/40 bg-muted/60",
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <i
                    className="inline-block h-1 w-6 rounded-full"
                    style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                  />
                  <span className="font-medium">{c.topicIds.map(topicLabel).join(", ")}</span>
                  <span className="text-muted-foreground">{L(c.note, lang)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.members.map((m) => (
                    <Tile key={m} id={m} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {calc.nextTabled ? (
            <p className="rounded-xl border bg-gray-alpha-50 p-2.5 text-xs">
              <span className="font-medium">{t.analysis.nextTabled}:</span>{" "}
              <span className="font-mono">{calc.nextTabled.proposalId}</span> ·{" "}
              {L(calc.nextTabled.reason, lang)}
            </p>
          ) : null}
        </div>
      </div>
      <section className="space-y-3">
        <h3 className="text-base font-semibold">{t.analysis.pairTitle}</h3>
        <PairMatrix round={calc.round} topic={topic} />
      </section>
    </div>
  );
}

/** Coalition graph (FR-A6, FR-A11): agents on a circle, coalitions as edges, veto rings. */
export function CoalitionGraph() {
  const { t, lang } = useRun();
  const { calc, rounds, round, setRound } = useCalculus();
  if (!calc) return <p className="text-sm text-muted-foreground">{t.analysis.noData}</p>;
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
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              {t.analysis.enlarge}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
            <DialogHeader>
              <DialogTitle>{t.analysis.coalitionGraph}</DialogTitle>
            </DialogHeader>
            <CoalitionDetail />
          </DialogContent>
        </Dialog>
      </div>
      <GraphSvg calc={calc} coalitions={calc.coalitions} />
      <KindLegend />
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
