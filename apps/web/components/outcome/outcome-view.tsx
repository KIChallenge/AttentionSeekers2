"use client";

import { type Forecast, type ImpactFigure, topicStatus } from "@sv/contracts";
import Link from "next/link";
import { useState } from "react";
import { statusLabel } from "@/components/analysis/consensus-matrix";
import { Chip, Empty, Panel, Tile } from "@/components/run/bits";
import { fmtNum, L } from "@/components/run/helpers";
import { SourceChip } from "@/components/run/provenance";
import { useRun } from "@/components/run/run-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

function fmtFig(f: ImpactFigure, lang: "de" | "en") {
  if (f.notModelled || f.value === null) return null;
  const sign = f.metric === "sv_spend_pp" || f.metric === "wait_change_pct";
  const v = fmtNum(f.value, lang, Math.abs(f.value) < 10 && f.value % 1 ? 1 : 0);
  return `${sign && f.value > 0 ? "+" : ""}${v.replace("-", "−")} ${f.unit}`;
}

function rangeOf(f: ImpactFigure, lang: "de" | "en") {
  if (f.low === null || f.high === null) return null;
  const n = (x: number) => fmtNum(x, lang, Math.abs(x) < 10 && x % 1 ? 1 : 0).replace("-", "−");
  return `${n(f.low)} ${lang === "de" ? "bis" : "to"} ${n(f.high)}`;
}

/** Ten-dot glyph for k of n (FR-J4); interval drawn as a lighter band. */
function DotGlyph({ k, n, lo, hi }: { k: number; n: number; lo: number; hi: number }) {
  const share = n ? k / n : 0;
  return (
    <span className="inline-flex gap-[3px]" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => {
        const pos = (i + 0.5) / 10;
        const filled = pos <= share;
        const inBand = pos >= lo && pos <= hi;
        return (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed ten-dot glyph
            key={i}
            className={cn(
              "inline-block size-2.5 rounded-[2px]",
              filled ? "bg-foreground" : inBand ? "bg-gray-alpha-400" : "bg-gray-alpha-150",
            )}
          />
        );
      })}
    </span>
  );
}

function ForecastCard({ f }: { f: Forecast }) {
  const { t, lang, snap } = useRun();
  const p = snap.proposals[f.measureId];
  const title = p ? L(p.title, lang) : f.measureId;
  const pctFmt = (x: number) => `${Math.round(x * 100)} %`;
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border p-3.5 md:grid-cols-[1fr_260px]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{f.measureId}</span>
          <span className="font-medium">{title}</span>
        </div>
        {f.status === "ok" && f.k !== null ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <DotGlyph k={f.k} n={f.n} lo={f.interval?.low ?? 0} hi={f.interval?.high ?? 0} />
            <p className="text-sm">
              <span className="font-semibold">{t.outcome.sentence(f.k, f.n)}</span>
              {f.interval ? (
                <span className="text-muted-foreground">
                  {" "}
                  (
                  {t.outcome.interval(
                    pctFmt(f.interval.low),
                    pctFmt(f.interval.high),
                    `${Math.round(f.interval.level * 100)} %`,
                    f.interval.method === "wilson" ? "Wilson" : "Jeffreys",
                  )}
                  )
                </span>
              ) : null}
            </p>
          </div>
        ) : f.status === "small_n" ? (
          <Alert className="mt-2">
            <AlertDescription className="text-sm">{t.outcome.smallN(f.n)}</AlertDescription>
          </Alert>
        ) : (
          <Alert className="mt-2">
            <AlertDescription className="text-sm">{t.outcome.unavailable}</AlertDescription>
          </Alert>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip className="font-mono text-[11px] text-muted-foreground">
            {t.outcome.classKey} {f.classKey}
          </Chip>
          {f.descriptor
            ? (
                [
                  ["measure_class", f.descriptor.measure_class],
                  ["cost", `${f.descriptor.cost_direction} ${f.descriptor.cost_band}`],
                  ["payer", f.descriptor.payer],
                  ["gesetz", f.descriptor.requires_legislation],
                  ["15a", f.descriptor.requires_15a_agreement],
                  ["gesamtvertrag", f.descriptor.requires_gesamtvertrag],
                  ["contestation", f.descriptor.contestation],
                  ["red_line", f.descriptor.red_line_crossed],
                ] as const
              ).map(([k, v]) => (
                <Chip key={k} className="text-[11px] text-muted-foreground">
                  {k} <span className="text-foreground">{String(v)}</span>
                </Chip>
              ))
            : null}
        </div>
      </div>
      <div className="border-l pl-3 text-xs">
        <div className="mb-1 text-muted-foreground">
          {t.outcome.analogs} ({f.analogs.length})
        </div>
        {f.analogs.length ? (
          <ul className="space-y-1">
            {f.analogs.map((a) => (
              <li key={a.caseId}>
                <Link href={`/archive/episodes/${a.episodeId}`} className="font-mono underline">
                  {a.episodeId}
                </Link>{" "}
                <span className="num text-muted-foreground">sim {a.similarity.toFixed(2)}</span> ·{" "}
                {a.outcome.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">·</span>
        )}
      </div>
    </div>
  );
}

export function OutcomeView() {
  const { snap, run, t, lang, runId } = useRun();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const proposals = snap.proposalOrder.map((id) => snap.proposals[id]).filter((p) => !!p);
  const classes = { consensus: 0, majority: 0, minority: 0, no_result: 0 };
  for (const tp of run.mandate.topics) classes[topicStatus(snap, tp.id).status]++;
  const failed = proposals.filter((p) => p?.status === "rejected").length;
  const byMeasure = new Map<string, ImpactFigure[]>();
  for (const f of snap.figures)
    byMeasure.set(f.measureId, [...(byMeasure.get(f.measureId) ?? []), f]);
  const metrics = [
    "cost_eur_pa",
    "sv_spend_pp",
    "wait_change_pct",
    "wait_weeks_median",
    "posts_filled",
  ] as const;
  const usedMetrics = metrics.filter((m) => snap.figures.some((f) => f.metric === m));
  const pkg = proposals
    .filter((p) => p?.status === "accepted")
    .sort((a, b) => (b?.topicIds.length ?? 0) - (a?.topicIds.length ?? 0))[0];
  const pkgFig = (m: string) => snap.figures.find((f) => f.measureId === pkg?.id && f.metric === m);
  const pkgForecast = snap.forecasts.find((f) => f.measureId === pkg?.id);
  const cap = run.room.budgetCeiling.maxIncreasePct;
  const sv = pkgFig("sv_spend_pp");
  const wait = pkgFig("wait_change_pct");

  return (
    <main className="mx-auto max-w-[1800px] px-4 sm:px-6 pt-5 pb-12">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.outcome.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.outcome.sub}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/runs/${runId}/analysis`}
            className="rounded-control border px-3 py-1.5 text-sm hover:border-foreground/40"
          >
            {t.outcome.toAnalysis}
          </Link>
          <Link
            href={`/runs/${runId}/result`}
            className="rounded-control bg-foreground px-3 py-1.5 text-sm text-background"
          >
            {t.outcome.toResult}
          </Link>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <div className="num text-2xl font-semibold">
            {classes.consensus} · {classes.majority} · {classes.minority} · {classes.no_result}
          </div>
          <div className="text-xs text-muted-foreground">{t.outcome.classes}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t.outcome.measures(proposals.length, failed)}
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="num text-2xl font-semibold">{sv ? fmtFig(sv, lang) : "·"}</div>
          <div className="text-xs text-muted-foreground">{t.outcome.metric.sv_spend_pp}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {sv ? `${t.outcome.range} ${rangeOf(sv, lang)}` : ""} · cap +{cap} %
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="num text-2xl font-semibold">{wait ? fmtFig(wait, lang) : "·"}</div>
          <div className="text-xs text-muted-foreground">{t.outcome.metric.wait_change_pct}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {wait ? `${t.outcome.range} ${rangeOf(wait, lang)}` : ""} ·{" "}
            {lang === "de" ? "Ziel" : "target"} −20 %
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          {pkgForecast?.status === "ok" && pkgForecast.k !== null ? (
            <>
              <div className="num text-2xl font-semibold">
                {pkgForecast.k}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  {t.live.of} {pkgForecast.n}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {t.outcome.realism.outcome}, {t.outcome.package} {pkg?.id}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {pkgForecast.interval
                  ? `${Math.round(pkgForecast.interval.low * 100)} ${lang === "de" ? "bis" : "to"} ${Math.round(pkgForecast.interval.high * 100)} %`
                  : ""}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-semibold text-muted-foreground">
                {t.common.notAvailable}
              </div>
              <div className="text-xs text-muted-foreground">{t.outcome.realism.outcome}</div>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Panel
          title={t.outcome.effects}
          aside={<span className="text-xs text-muted-foreground">{t.outcome.effectsSub}</span>}
        >
          {snap.figures.length === 0 ? (
            <Empty>{t.outcome.noFigures}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="sticky left-0 bg-card py-2 pr-2 font-normal">
                      {t.outcome.measure}
                    </th>
                    <th className="px-2 font-normal">{t.outcome.status}</th>
                    {usedMetrics.map((m) => (
                      <th key={m} className="px-2 text-right font-normal">
                        {t.outcome.metric[m]}
                      </th>
                    ))}
                    <th className="px-2 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {[...byMeasure.entries()].map(([mid, figs]) => {
                    const p = snap.proposals[mid];
                    const inputs = figs.flatMap((f) => f.inputs);
                    const assumptions = inputs.filter((i) => i.assumption).length;
                    return [
                      <tr key={mid} className="border-b align-top">
                        <td className="sticky left-0 max-w-[380px] bg-card py-2.5 pr-2">
                          <div className="flex items-start gap-2">
                            {p ? <Tile id={p.originAgent} /> : null}
                            <span>
                              <span className="font-mono text-xs text-muted-foreground">{mid}</span>{" "}
                              {p ? L(p.title, lang) : null}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          {p?.outcomeClass ? (
                            <Chip
                              className={cn(
                                p.outcomeClass === "consensus" &&
                                  "border-success/30 bg-success/10 text-success",
                                p.outcomeClass === "minority" && "border-warning/40 text-warning",
                              )}
                            >
                              {statusLabel(p.outcomeClass, lang)}
                              {" · "}
                              {p.supporters.length}/{run.agents.length}
                            </Chip>
                          ) : null}
                        </td>
                        {usedMetrics.map((m) => {
                          const f = figs.find((x) => x.metric === m);
                          return (
                            <td key={m} className="num px-2 py-2.5 text-right whitespace-nowrap">
                              {f ? (
                                f.notModelled ? (
                                  <span className="text-muted-foreground">
                                    {t.outcome.notModelled}
                                  </span>
                                ) : (
                                  <>
                                    {fmtFig(f, lang)}
                                    <div className="text-[11px] text-muted-foreground">
                                      {rangeOf(f, lang)}
                                    </div>
                                  </>
                                )
                              ) : (
                                <span className="text-muted-foreground">·</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setOpen((o) => ({ ...o, [mid]: !o[mid] }))}
                            aria-expanded={!!open[mid]}
                            className="rounded-control border px-2 py-0.5 text-xs whitespace-nowrap hover:border-foreground/40"
                          >
                            {t.outcome.assumptions} {assumptions ? `(${assumptions})` : ""}{" "}
                            {open[mid] ? "▴" : "▾"}
                          </button>
                        </td>
                      </tr>,
                      open[mid] ? (
                        <tr key={`${mid}-a`} className="border-b bg-gray-alpha-50">
                          <td colSpan={usedMetrics.length + 3} className="p-3">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                              {figs.map((f) => (
                                <div key={f.metric} className="space-y-1.5 text-xs">
                                  <div className="font-medium">{t.outcome.metric[f.metric]}</div>
                                  <div>
                                    <span className="text-muted-foreground">
                                      {t.outcome.inputs}:{" "}
                                    </span>
                                    {f.inputs.length
                                      ? f.inputs.map((i) => (
                                          <span
                                            key={i.name.text}
                                            className="mr-2 inline-flex flex-wrap items-center gap-1"
                                          >
                                            {L(i.name, lang)}:{" "}
                                            <span className="font-mono">{i.value}</span>
                                            {i.citation ? (
                                              <SourceChip cite={i.citation} compact />
                                            ) : null}
                                            {i.assumption ? (
                                              <Chip className="border-dashed">
                                                {t.outcome.assumption}
                                              </Chip>
                                            ) : null}
                                          </span>
                                        ))
                                      : "·"}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">
                                      {t.outcome.formula}:{" "}
                                    </span>
                                    <code className="font-mono">{f.formula}</code>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">
                                      {t.outcome.uncertainty}:{" "}
                                    </span>
                                    {L(f.uncertainty, lang)}
                                  </div>
                                  <div className="text-muted-foreground">
                                    {t.outcome.modelVersion}{" "}
                                    <span className="font-mono">{f.modelVersion}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">{t.outcome.nonAdditive}</p>
            </div>
          )}
        </Panel>

        <Panel
          title={t.outcome.forecast}
          sub={t.outcome.forecastSub}
          aside={
            snap.extractorVersion ? (
              <Chip className="font-mono text-muted-foreground">
                {t.outcome.extractor} {snap.extractorVersion}
              </Chip>
            ) : null
          }
        >
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">{t.outcome.realism.outcome}</div>
              <div className="text-lg font-semibold">{t.outcome.realism.outcomeVal}</div>
              <div className="text-xs text-muted-foreground">{t.outcome.realism.outcomeSub}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">{t.outcome.realism.fidelity}</div>
              <div className="text-lg font-semibold">{t.common.notAvailable}</div>
              <div className="text-xs text-muted-foreground">{t.outcome.realism.fidelitySub}</div>
            </div>
            <div className="rounded-xl border border-dashed p-3">
              <div className="text-xs text-muted-foreground">{t.outcome.realism.process}</div>
              <div className="text-lg font-semibold">{t.outcome.realism.processVal}</div>
              <div className="text-xs text-muted-foreground">{t.outcome.realism.processSub}</div>
            </div>
          </div>
          {snap.forecasts.length === 0 ? (
            <Alert>
              <AlertDescription>{t.outcome.noForecast}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {snap.forecasts.map((f) => (
                <ForecastCard key={f.measureId} f={f} />
              ))}
            </div>
          )}
          <p className="mt-3 rounded-xl border bg-gray-alpha-50 p-3 text-xs">{t.outcome.readAs}</p>
        </Panel>
      </div>
    </main>
  );
}
