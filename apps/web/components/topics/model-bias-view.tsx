"use client";

import { catalogAgent, type LocalizedText, localize } from "@sv/contracts";
import { useState } from "react";
import { AgentTile } from "@/components/run/agent-tile";
import { Section } from "@/components/shell/page";
import { usePrefs } from "@/components/shell/providers";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AxisDef, BiasRow } from "@/lib/model-bias";
import type { ModelBiasData } from "@/lib/model-bias-data";
import type { RunColumn } from "@/lib/topic-compare";
import { cn } from "@/lib/utils";
import { FamilyDot, familyColor, runLabel } from "./family";
import { topicT } from "./messages";
import { type ModelBiasMessages, modelBiasT } from "./model-bias-messages";

type Lang = "de" | "en";

const fmt = (x: number, lang: Lang, digits = 2) =>
  x.toLocaleString(lang === "de" ? "de-AT" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const signed = (x: number, lang: Lang, digits = 2) =>
  `${x > 0 ? "+" : x < 0 ? "−" : "±"}${fmt(Math.abs(x), lang, digits)}`;
const pct = (x: number) => `${Math.round(x * 100)} %`;

function RunName({ run, lang }: { run: RunColumn; lang: Lang }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <FamilyDot family={run.seatFamilies} />
      {runLabel(run, topicT(lang))}
    </span>
  );
}

function tierOf(i: number, n: number): "near" | "mid" | "far" {
  const third = n / 3;
  return i < third ? "near" : i < 2 * third ? "mid" : "far";
}

// ---------- 5. ranking ----------

function Ranking({
  data,
  rows,
  runs,
  lang,
  t,
}: {
  data: ModelBiasData;
  rows: Map<string, BiasRow>;
  runs: Map<string, RunColumn>;
  lang: Lang;
  t: ModelBiasMessages;
}) {
  const ranked = data.bias.ranking.flatMap((id) => {
    const r = rows.get(id);
    const run = runs.get(id);
    return r && run ? [{ r, run }] : [];
  });
  const max = Math.max(0.5, ...ranked.map((x) => x.r.score.score ?? 0));
  const term = (v: number | null) => (v === null ? t.noAudit : fmt(v, lang));
  return (
    <Section title={t.rankTitle} aria-label={t.rankTitle}>
      <div className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t.rankHead.rank}</TableHead>
              <TableHead>{t.rankHead.run}</TableHead>
              <TableHead className="w-[38%]">
                <span className="flex justify-between">
                  <span>{t.scale[0]}</span>
                  <span>{t.scale[1]}</span>
                </span>
              </TableHead>
              <TableHead className="text-right">{t.rankHead.score}</TableHead>
              <TableHead className="text-right">{t.rankHead.stance}</TableHead>
              <TableHead className="text-right">{t.rankHead.outcome}</TableHead>
              <TableHead className="text-right">{t.rankHead.quality}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map(({ r, run }, i) => {
              const s = r.score.score ?? 0;
              const tier = tierOf(i, ranked.length);
              return (
                <TableRow key={r.id}>
                  <TableCell className="num">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <RunName run={run} lang={lang} />
                      <Badge
                        variant="outline"
                        className={cn("font-normal", tier === "far" && "font-medium")}
                      >
                        {t.tier[tier]}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div
                      className="h-2.5 rounded-full bg-gray-alpha-100"
                      role="img"
                      aria-label={`${t.rankHead.score} ${fmt(s, lang)}`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(s / max) * 100}%`,
                          background: familyColor(run.seatFamilies),
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="num text-right font-semibold">{fmt(s, lang)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {term(r.score.stanceTerm)}
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {term(r.score.outcomeTerm)}
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {term(r.score.qualityTerm)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">{t.formulaTitle}</summary>
        <ul className="mt-2 flex max-w-4xl list-disc flex-col gap-1 pl-5 text-muted-foreground">
          {t.formula.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

// ---------- 1. direction ----------

function DirectionChart({
  axis,
  order,
  rows,
  runs,
  lang,
  t,
}: {
  axis: AxisDef;
  order: string[];
  rows: Map<string, BiasRow>;
  runs: Map<string, RunColumn>;
  lang: Lang;
  t: ModelBiasMessages;
}) {
  const vals = order.map((id) => rows.get(id)?.direction[axis.id] ?? null);
  const lim = Math.max(0.5, Math.ceil(Math.max(...vals.map((v) => Math.abs(v ?? 0))) * 4) / 4);
  const pos = (v: number) => 50 + (v / lim) * 50;
  const [neg, plus] = axis.poles.map((p) => localize(p, lang));
  return (
    <figure className="min-w-0 space-y-3">
      <figcaption className="text-sm font-medium">{localize(axis.label, lang)}</figcaption>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-1.5 text-sm">
        <span />
        <div className="flex justify-between gap-2 whitespace-nowrap text-xs text-muted-foreground">
          <span>← {t.more(neg ?? "")}</span>
          <span>{t.more(plus ?? "")} →</span>
        </div>
        <span />
        {order.map((id, i) => {
          const run = runs.get(id);
          const v = vals[i] ?? null;
          if (!run) return null;
          const left = v === null ? 50 : Math.min(50, pos(v));
          const width = v === null ? 0 : Math.abs(pos(v) - 50);
          return (
            <div key={id} className="contents">
              <RunName run={run} lang={lang} />
              <div
                className="relative h-5"
                role="img"
                aria-label={`${runLabel(run, topicT(lang))}: ${v === null ? "–" : signed(v, lang)} ${
                  v === null ? "" : v >= 0 ? t.more(plus ?? "") : t.more(neg ?? "")
                }`}
                title={v === null ? undefined : `${signed(v, lang)} · ${v >= 0 ? plus : neg}`}
              >
                <span className="absolute inset-y-0 left-1/2 w-px bg-gray-alpha-400" />
                <span
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[4px]"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: familyColor(run.seatFamilies),
                  }}
                />
              </div>
              <span className="num text-right text-xs">{v === null ? "–" : signed(v, lang)}</span>
            </div>
          );
        })}
        <span />
        <div className="num flex justify-between text-[11px] text-muted-foreground">
          <span>{signed(-lim, lang)}</span>
          <span>0</span>
          <span>{signed(lim, lang)}</span>
        </div>
        <span />
      </div>
    </figure>
  );
}

// ---------- 2. position map ----------

function PositionMap({
  data,
  order,
  rows,
  runs,
  lang,
  t,
}: {
  data: ModelBiasData;
  order: string[];
  rows: Map<string, BiasRow>;
  runs: Map<string, RunColumn>;
  lang: Lang;
  t: ModelBiasMessages;
}) {
  const [sel, setSel] = useState(order[0] ?? "");
  const row = rows.get(sel);
  const { agents, expectedPoints, axes } = data.bias;
  const ax = axes.find((a) => a.id === "x");
  const ay = axes.find((a) => a.id === "y");
  const W = 520;
  const pad = 36;
  const all = [
    ...Object.values(expectedPoints),
    ...[...rows.values()].flatMap((r) => Object.values(r.finals)),
  ];
  const extent = (k: "x" | "y"): [number, number] => {
    const vs = all.map((p) => p[k]).filter((v): v is number => v !== null);
    const lo = Math.max(-2, Math.floor((Math.min(0, ...vs) - 0.1) * 2) / 2);
    const hi = Math.min(2, Math.ceil((Math.max(0, ...vs) + 0.1) * 2) / 2);
    return [lo, hi];
  };
  const [x0, x1] = extent("x");
  const [y0, y1] = extent("y");
  const sx = (v: number) => pad + ((v - x0) / (x1 - x0)) * (W - 2 * pad);
  const sy = (v: number) => W - pad - ((v - y0) / (y1 - y0)) * (W - 2 * pad);
  const loc = (x: LocalizedText | undefined) => (x ? localize(x, lang) : "");
  const color = (id: string) => catalogAgent(id)?.color ?? "var(--c-opt)";
  const code = (id: string) => catalogAgent(id)?.code ?? id.toUpperCase();
  return (
    <Section title={t.mapTitle} aria-label={t.mapTitle}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={sel}
        onValueChange={(v) => v && setSel(v)}
        className="flex flex-wrap justify-start"
        aria-label={t.mapRun}
      >
        {order.map((id) => {
          const run = runs.get(id);
          return run ? (
            <ToggleGroupItem key={id} value={id} className="px-2.5 text-xs">
              <RunName run={run} lang={lang} />
            </ToggleGroupItem>
          ) : null;
        })}
      </ToggleGroup>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]">
        <svg
          viewBox={`0 0 ${W} ${W}`}
          className="w-full max-w-[520px] text-muted-foreground"
          role="img"
          aria-label={`${t.mapTitle}: ${runs.get(sel) ? runLabel(runs.get(sel) as RunColumn, topicT(lang)) : ""}`}
        >
          <defs>
            {agents.map((a) => (
              <marker
                key={a}
                id={`mb-arrow-${a}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={color(a)} />
              </marker>
            ))}
          </defs>
          <rect
            x={pad}
            y={pad}
            width={W - 2 * pad}
            height={W - 2 * pad}
            fill="none"
            stroke="var(--gray-alpha-200)"
          />
          <line x1={sx(0)} x2={sx(0)} y1={pad} y2={W - pad} stroke="var(--gray-alpha-300)" />
          <line y1={sy(0)} y2={sy(0)} x1={pad} x2={W - pad} stroke="var(--gray-alpha-300)" />
          <text x={pad} y={W - 12} fontSize="11" fill="currentColor">
            ← {loc(ax?.poles[0])}
          </text>
          <text x={W - pad} y={W - 12} fontSize="11" fill="currentColor" textAnchor="end">
            {loc(ax?.poles[1])} →
          </text>
          <text
            x={14}
            y={W - pad}
            fontSize="11"
            fill="currentColor"
            transform={`rotate(-90 14 ${W - pad})`}
          >
            ← {loc(ay?.poles[0])}
          </text>
          <text
            x={14}
            y={pad}
            fontSize="11"
            fill="currentColor"
            textAnchor="end"
            transform={`rotate(-90 14 ${pad})`}
          >
            {loc(ay?.poles[1])} →
          </text>
          {order
            .filter((id) => id !== sel)
            .flatMap((id) =>
              agents.map((a) => {
                const p = rows.get(id)?.finals[a];
                if (!p || p.x === null || p.y === null) return null;
                return (
                  <circle
                    key={`${id}-${a}`}
                    cx={sx(p.x)}
                    cy={sy(p.y)}
                    r={2.5}
                    fill="var(--gray-alpha-400)"
                  />
                );
              }),
            )}
          {agents.map((a) => {
            const e = expectedPoints[a];
            const f = row?.finals[a];
            if (!e || e.x === null || e.y === null) return null;
            const hasF = f && f.x !== null && f.y !== null;
            const fx = hasF ? sx(f.x as number) : sx(e.x);
            const fy = hasF ? sy(f.y as number) : sy(e.y);
            const len = Math.hypot(fx - sx(e.x), fy - sy(e.y));
            return (
              <g key={a}>
                <title>
                  {`${catalogAgent(a)?.[lang === "de" ? "nameDe" : "glossEn"] ?? a}: ${t.mapExpected} (${fmt(e.x, lang)}, ${fmt(e.y, lang)})${
                    hasF
                      ? `, ${t.mapFinal} (${fmt(f.x as number, lang)}, ${fmt(f.y as number, lang)})`
                      : ""
                  }`}
                </title>
                <circle
                  cx={sx(e.x)}
                  cy={sy(e.y)}
                  r={5}
                  fill="var(--card)"
                  stroke={color(a)}
                  strokeWidth={2}
                />
                {hasF && len > 8 ? (
                  <line
                    x1={sx(e.x)}
                    y1={sy(e.y)}
                    x2={fx}
                    y2={fy}
                    stroke={color(a)}
                    strokeWidth={2}
                    markerEnd={`url(#mb-arrow-${a})`}
                  />
                ) : null}
                {hasF ? (
                  <circle
                    cx={fx}
                    cy={fy}
                    r={4}
                    fill={color(a)}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ) : null}
                <text
                  x={fx + 8}
                  y={fy - 6}
                  fontSize="11"
                  fontWeight={600}
                  fill="var(--foreground)"
                  paintOrder="stroke"
                  stroke="var(--card)"
                  strokeWidth={3}
                >
                  {code(a)}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full border-2 border-foreground" />
              {t.mapExpected}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-foreground" />
              {t.mapFinal}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-gray-alpha-400" />
              {t.mapOthers}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">{loc(ax?.label)}</TableHead>
                <TableHead className="text-right">{loc(ay?.label)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => {
                const e = expectedPoints[a];
                const f = row?.finals[a];
                const d = (k: "x" | "y") =>
                  e && f && e[k] !== null && f[k] !== null
                    ? signed((f[k] as number) - (e[k] as number), lang)
                    : "–";
                return (
                  <TableRow key={a}>
                    <TableCell>
                      <AgentTile agentId={a} withName lang={lang} />
                    </TableCell>
                    <TableCell className="num text-right">{d("x")}</TableCell>
                    <TableCell className="num text-right">{d("y")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </Section>
  );
}

// ---------- 3. heatmap ----------

function Heatmap({
  data,
  order,
  rows,
  runs,
  lang,
  t,
}: {
  data: ModelBiasData;
  order: string[];
  rows: Map<string, BiasRow>;
  runs: Map<string, RunColumn>;
  lang: Lang;
  t: ModelBiasMessages;
}) {
  const { agents } = data.bias;
  const shade = (v: number) =>
    `color-mix(in oklab, var(--chart-1) ${Math.round(Math.min(1, v / 2) * 70)}%, transparent)`;
  return (
    <Section title={t.heatTitle} aria-label={t.heatTitle}>
      <div className="overflow-x-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead />
              {agents.map((a) => (
                <TableHead key={a} className="text-center">
                  <span title={catalogAgent(a)?.[lang === "de" ? "nameDe" : "glossEn"] ?? a}>
                    <AgentTile agentId={a} lang={lang} className="mx-auto" />
                  </span>
                </TableHead>
              ))}
              <TableHead className="border-l text-right">∅</TableHead>
              <TableHead className="text-right" title={t.personaNote}>
                {t.persona}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.map((id) => {
              const r = rows.get(id);
              const run = runs.get(id);
              if (!r || !run) return null;
              const pe = run.seatFamilies !== "mixed" ? data.persona[run.seatFamilies] : undefined;
              return (
                <TableRow key={id}>
                  <TableCell>
                    <RunName run={run} lang={lang} />
                  </TableCell>
                  {agents.map((a) => {
                    const v = r.deviation[a] ?? null;
                    return (
                      <TableCell key={a} className="p-0.5">
                        <div
                          className="num rounded-sm px-1 py-1.5 text-center text-xs"
                          style={v === null ? undefined : { background: shade(v) }}
                        >
                          {v === null ? "–" : fmt(v, lang, 1)}
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="num border-l text-right font-semibold">
                    {r.stanceDev === null ? "–" : fmt(r.stanceDev, lang)}
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {pe ? pct(pe.stanceAgreement) : t.noEval}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ul className="mt-3 flex flex-col gap-0.5 text-xs text-muted-foreground">
        <li>{t.heatNote}</li>
        <li>
          {t.persona}: {t.personaNote}
        </li>
      </ul>
    </Section>
  );
}

// ---------- 4. temperament ----------

function TemperamentTable({
  data,
  order,
  rows,
  runs,
  lang,
  t,
}: {
  data: ModelBiasData;
  order: string[];
  rows: Map<string, BiasRow>;
  runs: Map<string, RunColumn>;
  lang: Lang;
  t: ModelBiasMessages;
}) {
  const hr = data.bias.histRate;
  return (
    <Section title={t.tempTitle} aria-label={t.tempTitle}>
      <div className="overflow-x-auto">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">{t.temp.accepted}</TableHead>
              <TableHead className="text-right">{t.temp.gap}</TableHead>
              <TableHead className="text-right" title={t.movesNote}>
                {t.temp.moves}
              </TableHead>
              <TableHead className="text-right" title={t.heldNote}>
                {t.temp.held}
              </TableHead>
              <TableHead className="text-right">{t.temp.touched}</TableHead>
              <TableHead className="text-right">{t.temp.conditional}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-gray-alpha-100/60">
              <TableCell className="font-medium">{t.histRow}</TableCell>
              <TableCell className="num text-right font-semibold">{pct(hr)}</TableCell>
              <TableCell colSpan={5} />
            </TableRow>
            {order.map((id) => {
              const r = rows.get(id);
              const run = runs.get(id);
              if (!r || !run) return null;
              const m = r.temperament;
              const gap = m.acceptRate === null ? null : m.acceptRate - hr;
              return (
                <TableRow key={id}>
                  <TableCell>
                    <RunName run={run} lang={lang} />
                  </TableCell>
                  <TableCell className="num text-right">
                    {m.accepted}/{m.tabled}
                    <span className="ml-1.5 text-muted-foreground">
                      {m.acceptRate === null ? "" : pct(m.acceptRate)}
                    </span>
                  </TableCell>
                  <TableCell className="num text-right">
                    {gap === null ? "–" : `${signed(gap * 100, lang, 0)} pp`}
                  </TableCell>
                  <TableCell className="num text-right">{fmt(m.movesPerRound, lang, 1)}</TableCell>
                  <TableCell className="num text-right">
                    {m.held}/{m.redLines}
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {m.touched}/{m.redLines}
                  </TableCell>
                  <TableCell className="num text-right">
                    {m.conditionalShare === null ? "–" : pct(m.conditionalShare)}
                    <span className="ml-1.5 text-muted-foreground">({m.votes})</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ul className="mt-3 flex flex-col gap-0.5 text-xs text-muted-foreground">
        <li>{t.histNote(data.hist.k, data.hist.n)}</li>
        <li>
          {t.temp.moves}: {t.movesNote}
        </li>
        <li>{t.heldNote}</li>
      </ul>
    </Section>
  );
}

// ---------- page body ----------

function summary(
  data: ModelBiasData,
  rows: Map<string, BiasRow>,
  runs: Map<string, RunColumn>,
  lang: Lang,
  t: ModelBiasMessages,
): string {
  const tt = topicT(lang);
  const name = (id: string) => {
    const r = runs.get(id);
    return r ? runLabel(r, tt) : id;
  };
  const sc = (id: string) => fmt(rows.get(id)?.score.score ?? 0, lang);
  const scored = data.bias.ranking.filter((id) => rows.get(id)?.score.score !== null);
  const best = scored[0];
  const worst = scored.at(-1);
  if (!best || !worst) return "";
  let pull = "";
  let top: { id: string; axis: AxisDef; v: number } | null = null;
  for (const axis of data.bias.axes)
    for (const [id, r] of rows) {
      const v = r.direction[axis.id];
      if (v !== null && (!top || Math.abs(v) > Math.abs(top.v))) top = { id, axis, v };
    }
  if (top) {
    const pole = top.axis.poles[top.v >= 0 ? 1 : 0];
    pull = t.pull(name(top.id), localize(pole, lang), signed(top.v, lang));
  }
  return t.summary(name(best), sc(best), name(worst), sc(worst), pull);
}

export function ModelBiasView({ data }: { data: ModelBiasData }) {
  const { lang } = usePrefs();
  const t = modelBiasT(lang);
  const rows = new Map(data.bias.rows.map((r) => [r.id, r]));
  const runs = new Map(data.runs.map((r) => [r.id, r]));
  const order = data.runs.map((r) => r.id).filter((id) => rows.has(id));
  const props = { data, order, rows, runs, lang, t };
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border bg-card p-5 shadow-none sm:p-6" aria-label={t.title}>
        <p className="max-w-4xl text-base leading-relaxed">{summary(data, rows, runs, lang, t)}</p>
        <p className="mt-3 max-w-4xl border-l-2 border-warning/60 pl-3 text-xs text-muted-foreground">
          {t.caveat(order.length)}
        </p>
      </section>
      <Ranking data={data} rows={rows} runs={runs} lang={lang} t={t} />
      <Section title={t.dirTitle} aria-label={t.dirTitle}>
        <div className="grid gap-8 xl:grid-cols-2">
          {data.bias.axes.map((axis) => (
            <DirectionChart key={axis.id} axis={axis} {...props} />
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t.dirNote}</p>
      </Section>
      <PositionMap {...props} />
      <Heatmap {...props} />
      <TemperamentTable {...props} />
    </div>
  );
}
