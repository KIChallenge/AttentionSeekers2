"use client";

import { catalogAgent, localize } from "@sv/contracts";
import { Fragment } from "react";
import { AgentTile } from "@/components/run/agent-tile";
import { Level, usePrefs } from "@/components/shell/providers";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/format";
import type {
  RunColumn,
  SeatEffect,
  TopicCell,
  TopicComparison,
  TopicRow,
} from "@/lib/topic-compare";
import { familyOf } from "@/lib/topic-compare";
import type { ClassRate, Excluded, HistoricRates } from "@/lib/topic-runs";
import { cn } from "@/lib/utils";
import { type TopicMessages, topicT } from "./messages";

type Lang = "de" | "en";

const pct = (x: number) => `${Math.round(x * 100)} %`;
const signed = (x: number, lang: Lang, digits = 1) =>
  `${x > 0 ? "+" : ""}${x.toLocaleString(lang === "de" ? "de-AT" : "en-GB", {
    maximumFractionDigits: digits,
  })}`.replace("-", "−");

const FAMILY_DOT: Record<string, string> = {
  gpt: "bg-foreground",
  nova: "bg-warning",
  mixed: "bg-gray-alpha-500",
};

function FamilyDot({ family, className }: { family: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        FAMILY_DOT[family] ?? "bg-info",
        className,
      )}
    />
  );
}

function runLabel(r: RunColumn, t: TopicMessages): string {
  if (r.isReference) return `${t.reference}${r.id.endsWith("presse") ? " + Presse" : ""}`;
  return t.label[r.label] ?? r.label;
}

function agentName(id: string, lang: Lang) {
  const a = catalogAgent(id);
  return a ? (lang === "de" ? a.nameDe : a.glossEn) : id;
}

function joinList(xs: string[], lang: Lang) {
  if (xs.length <= 1) return xs.join("");
  const and = lang === "de" ? " und " : " and ";
  return `${xs.slice(0, -1).join(", ")}${and}${xs.at(-1)}`;
}

/** Plain-language summary over all runs, generated from the measured rows. */
function summarySentences(cmp: TopicComparison, lang: Lang, t: TopicMessages): string[] {
  const n = cmp.runs.length;
  const fams = cmp.families.map((f) => t.fam[f] ?? f);
  const name = (r: TopicRow) => localize(r.label, lang);
  const robustAgreed = cmp.topics.filter((r) => r.robustness === "robust" && r.agreedIn === n);
  const robustOpen = cmp.topics.filter((r) => r.robustness === "robust" && r.agreedIn === 0);
  const dependent = cmp.topics.filter((r) => r.robustness === "model_dependent");
  const acc = cmp.runs.map((r) => r.accepted);
  const minA = Math.min(...acc);
  const maxA = Math.max(...acc);
  const seatDep = cmp.seats.filter((s) => s.verdict === "model_dependent");
  const de = lang === "de";
  const out: string[] = [];
  out.push(
    de
      ? `${n} Läufe derselben Frage, Institutionen gespielt von ${joinList(fams, lang)}.`
      : `${n} runs of the same question, institutions played by ${joinList(fams, lang)}.`,
  );
  if (robustAgreed.length)
    out.push(
      de
        ? `In allen Läufen Einigung: ${joinList(robustAgreed.map(name), lang)}.`
        : `Agreed in every run: ${joinList(robustAgreed.map(name), lang)}.`,
    );
  if (robustOpen.length)
    out.push(
      de
        ? `In keinem Lauf Einigung: ${joinList(robustOpen.map(name), lang)}.`
        : `Agreed in no run: ${joinList(robustOpen.map(name), lang)}.`,
    );
  if (dependent.length)
    out.push(
      de
        ? `Modellabhängig: ${joinList(
            dependent.map(
              (r) => `${name(r)} (Einigung ${r.agreedIn}/${n}, angenommen ${r.acceptedIn}/${n})`,
            ),
            lang,
          )}.`
        : `Model-dependent: ${joinList(
            dependent.map(
              (r) => `${name(r)} (agreed ${r.agreedIn}/${n}, accepted ${r.acceptedIn}/${n})`,
            ),
            lang,
          )}.`,
    );
  out.push(
    de
      ? `Angenommene Vorschläge je Lauf: ${minA === maxA ? minA : `${minA} bis ${maxA}`}.`
      : `Accepted proposals per run: ${minA === maxA ? minA : `${minA} to ${maxA}`}.`,
  );
  out.push(
    seatDep.length
      ? de
        ? `Institutionen, deren Haltung mit dem Modell wechselt: ${joinList(
            seatDep.map((s) => agentName(s.agentId, lang)),
            lang,
          )}.`
        : `Institutions whose stance changes with the model: ${joinList(
            seatDep.map((s) => agentName(s.agentId, lang)),
            lang,
          )}.`
      : de
        ? "Keine Institution wechselt ihre Haltung messbar mit dem Modell."
        : "No institution measurably changes its stance with the model.",
  );
  const measured = cmp.seats.filter((s) => s.betweenFamilies !== null && s.withinFamily !== null);
  const noisy = measured.filter((s) => (s.withinFamily ?? 0) >= (s.betweenFamilies ?? 0));
  if (measured.length)
    out.push(
      de
        ? `Bei ${noisy.length} von ${measured.length} Institutionen streut die Haltung zwischen zwei Läufen mit demselben Modell mindestens so stark wie zwischen den Modellfamilien: Ein Teil der Unterschiede ist Laufrauschen, nicht Modelleffekt.`
        : `For ${noisy.length} of ${measured.length} institutions the stance varies at least as much between two runs with the same model as between model families: part of the difference is run-to-run noise, not a model effect.`,
    );
  return out;
}

const AGREE_CELL = {
  agreed: "border-success/40 bg-success/10 text-success",
  open: "border-dashed text-muted-foreground",
};

function ProposalMarks({ cell, t }: { cell: TopicCell; t: TopicMessages }) {
  if (cell.proposals.length === 0)
    return <span className="text-[11px] text-muted-foreground">{t.notTabled}</span>;
  const acc = cell.proposals.filter((p) => p.status === "accepted").length;
  const rej = cell.proposals.filter((p) => p.status === "rejected").length;
  const open = cell.proposals.length - acc - rej;
  return (
    <span className="flex flex-wrap gap-1 text-[11px]">
      {acc ? <span className="font-medium text-success">{`${acc} ${t.acceptedShort}`}</span> : null}
      {rej ? <span className="text-destructive">{`${rej} ${t.rejectedShort}`}</span> : null}
      {open ? <span className="text-muted-foreground">{`${open} ${t.openProposal}`}</span> : null}
    </span>
  );
}

function HistoryCell({
  cls,
  rate,
  t,
  lang,
}: {
  cls: string | null;
  rate: ClassRate | undefined;
  t: TopicMessages;
  lang: Lang;
}) {
  if (!cls) return <span className="text-xs text-muted-foreground">–</span>;
  if (!rate || rate.n === 0)
    return (
      <span className="text-xs text-muted-foreground">
        <span className="font-mono">{cls}</span>: {t.histNone}
      </span>
    );
  return (
    <div
      className="flex flex-col gap-1 text-xs"
      title={rate.via ? `${rate.via} ${t.via(cls)}` : cls}
    >
      <span className="leading-snug">
        {t.histShort(rate.k, rate.n)}
        {rate.low !== null && rate.high !== null ? (
          <span className="num block text-muted-foreground">
            {`90 %: ${pct(rate.low)} ${lang === "de" ? "bis" : "to"} ${pct(rate.high)}`}
          </span>
        ) : null}
      </span>
      {rate.smallN ? <span className="text-warning">{t.smallN}</span> : null}
      <Level min="engineer">
        <span className="text-muted-foreground">
          <span className="font-mono">{rate.via ?? cls}</span>
          {rate.via ? <span>{` ${t.via(cls)}`}</span> : null}
        </span>
      </Level>
    </div>
  );
}

function StanceStrip({
  row,
  runs,
  lang,
  t,
}: {
  row: TopicRow;
  runs: RunColumn[];
  lang: Lang;
  t: TopicMessages;
}) {
  const x = (s: number) => `${((s + 2) / 4) * 100}%`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium">{t.stanceSpread}</div>
      {Object.entries(row.stances).map(([agentId, xs]) => {
        const vals = xs.filter((v): v is number => v !== null);
        const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : null;
        return (
          <div
            key={agentId}
            className="grid grid-cols-[minmax(0,13rem)_1fr_3rem] items-center gap-2"
          >
            <AgentTile
              agentId={agentId}
              withName
              lang={lang}
              className="min-w-0 truncate text-xs"
            />
            <div className="relative h-4 rounded-sm bg-gray-alpha-100">
              <span className="absolute inset-y-0 left-1/2 w-px bg-gray-alpha-300" />
              {xs.map((v, i) => {
                const r = runs[i];
                if (v === null || !r) return null;
                const fam = familyOf(r.seatModels[agentId]);
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: one dot per run column
                    key={i}
                    title={`${runLabel(r, t)}: ${signed(v, lang)} (${t.fam[fam] ?? fam})`}
                    className={cn(
                      "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                      FAMILY_DOT[fam] ?? "bg-info",
                    )}
                    style={{ left: x(v) }}
                  />
                );
              })}
            </div>
            <span
              className={cn(
                "num text-right text-xs",
                spread !== null && spread >= 1
                  ? "font-semibold text-warning"
                  : "text-muted-foreground",
              )}
            >
              {spread === null ? "–" : spread.toFixed(1)}
            </span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,13rem)_1fr_3rem] gap-2 text-[10px] text-muted-foreground">
        <span />
        <span className="flex justify-between">
          <span>−2</span>
          <span>0</span>
          <span>+2</span>
        </span>
        <span className="text-right">{t.spread}</span>
      </div>
    </div>
  );
}

function TopicDetail({
  row,
  runs,
  rate,
  lang,
  t,
}: {
  row: TopicRow;
  runs: RunColumn[];
  rate: ClassRate | undefined;
  lang: Lang;
  t: TopicMessages;
}) {
  const statusText: Record<string, string> = {
    accepted: t.acceptedShort,
    rejected: t.rejectedShort,
    open: t.openProposal,
    withdrawn: t.withdrawn,
  };
  return (
    <div className="grid grid-cols-1 gap-5 border-t bg-gray-alpha-50 p-4 xl:grid-cols-[1.1fr_1fr]">
      <StanceStrip row={row} runs={runs} lang={lang} t={t} />
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <div className="mb-1.5 text-xs font-medium">{t.proposals}</div>
          <ul className="flex flex-col gap-1.5 text-xs">
            {row.cells.map((c, i) => {
              const r = runs[i];
              if (!r) return null;
              return (
                <li key={c.runId} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <FamilyDot family={r.seatFamilies} />
                    {runLabel(r, t)}
                    {c.waitChangePct !== null || c.costEurMio !== null ? (
                      <span className="num font-normal text-muted-foreground">
                        {c.waitChangePct !== null
                          ? ` · ${t.col.wait} ${signed(c.waitChangePct, lang)} %`
                          : ""}
                        {c.costEurMio !== null
                          ? ` · ${signed(c.costEurMio, lang, 0)} Mio. EUR`
                          : ""}
                      </span>
                    ) : null}
                  </span>
                  {c.proposals.length === 0 ? (
                    <span className="pl-3.5 text-muted-foreground">{t.notTabled}</span>
                  ) : (
                    c.proposals.map((p) => (
                      <span key={p.id} className="flex gap-1.5 pl-3.5">
                        <span
                          className={cn(
                            "shrink-0",
                            p.status === "accepted" && "text-success",
                            p.status === "rejected" && "text-destructive",
                            p.status !== "accepted" &&
                              p.status !== "rejected" &&
                              "text-muted-foreground",
                          )}
                        >
                          {statusText[p.status]}
                        </span>
                        <span className="min-w-0">{localize(p.title, lang)}</span>
                        <Level min="engineer">
                          <span className="font-mono text-muted-foreground">{p.measureClass}</span>
                        </Level>
                      </span>
                    ))
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        {rate && rate.n > 0 ? (
          <div className="text-xs">
            <div className="mb-1 font-medium">
              {t.hist(rate.k, rate.n, pct(rate.low ?? 0), pct(rate.high ?? 1))}
              {rate.modified ? `, ${t.modified(rate.modified)}` : ""}
            </div>
            {rate.smallN ? <div className="mb-1 text-warning">{t.smallN}</div> : null}
            <div className="text-muted-foreground">{t.analogs}:</div>
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {rate.analogs.map((a) => (
                <li key={a.episodeId} className="flex gap-1.5">
                  <span className="num shrink-0 text-muted-foreground">{a.date.slice(0, 4)}</span>
                  <span className="min-w-0 truncate" title={a.title}>
                    {a.title}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {t.outcome[a.outcome] ?? a.outcome}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SeatRow({ s, lang, t }: { s: SeatEffect; lang: Lang; t: TopicMessages }) {
  const max = 2;
  const w = (v: number | null) => `${Math.min(100, ((v ?? 0) / max) * 100)}%`;
  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <AgentTile agentId={s.agentId} withName lang={lang} />
        <Level min="engineer">
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {Object.entries(s.families)
              .map(([f, c]) => `${t.fam[f] ?? f} ×${c}`)
              .join(" · ")}
          </div>
        </Level>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-28 rounded-full bg-gray-alpha-100">
            <span
              className={cn(
                "block h-2 rounded-full",
                s.verdict === "model_dependent" ? "bg-warning" : "bg-foreground/60",
              )}
              style={{ width: w(s.betweenFamilies) }}
            />
          </span>
          <span className="num text-xs">{s.betweenFamilies?.toFixed(2) ?? "–"}</span>
        </div>
      </td>
      <td className="num px-3 py-2 text-xs text-muted-foreground">
        {s.withinFamily?.toFixed(2) ?? "–"}
      </td>
      <td className="px-3 py-2">
        <Badge
          variant="outline"
          className={cn(
            s.verdict === "model_dependent" && "border-warning/40 bg-warning/10 text-warning",
            s.verdict === "stable" && "border-success/30 text-success",
          )}
        >
          {t.verdict[s.verdict]}
        </Badge>
      </td>
    </tr>
  );
}

export function TopicView({
  cmp,
  hist,
  excluded,
}: {
  cmp: TopicComparison;
  hist: HistoricRates;
  excluded: Excluded[];
}) {
  const { lang } = usePrefs();
  const t = topicT(lang);
  const n = cmp.runs.length;
  const sentences = summarySentences(cmp, lang, t);
  const overall = hist.overall;
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card p-4 shadow-xs" aria-label={t.summaryTitle}>
        <h2 className="text-base font-semibold">{t.summaryTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{cmp.question}</p>
        <ul className="mt-2 flex max-w-4xl flex-col gap-0.5 text-sm leading-snug">
          {sentences.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-2 max-w-4xl border-l-2 border-warning/60 pl-3 text-xs text-muted-foreground">
          {t.caveat}
        </p>
      </section>

      <section className="rounded-2xl border bg-card shadow-xs" aria-label={t.topicsTitle}>
        <div className="p-4 pb-2">
          <h2 className="text-base font-semibold">{t.topicsTitle}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.topicsSub}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t.col.topic}</th>
                {cmp.runs.map((r) => (
                  <th key={r.id} className="px-2 py-2 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <FamilyDot family={r.seatFamilies} />
                      {runLabel(r, t)}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">{t.col.history}</th>
              </tr>
            </thead>
            <tbody>
              {cmp.topics.map((row) => {
                const rate = row.measureClass ? hist.classes[row.measureClass] : undefined;
                return (
                  <Fragment key={row.id}>
                    <tr className="border-t align-top" data-topic={row.id}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{localize(row.label, lang)}</div>
                        {row.measure ? (
                          <div className="text-xs text-muted-foreground">
                            {localize(row.measure, lang)}
                          </div>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              row.robustness === "robust" && "border-success/30 text-success",
                              row.robustness === "model_dependent" &&
                                "border-warning/40 bg-warning/10 text-warning",
                            )}
                          >
                            {t[row.robustness]}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {t.agreedIn(row.agreedIn, n)}
                          </span>
                        </div>
                      </td>
                      {row.cells.map((c) => (
                        <td key={c.runId} className="px-2 py-2.5">
                          <div className="flex flex-col gap-1">
                            <span
                              className={cn(
                                "w-fit rounded-md border px-1.5 py-0.5 text-xs",
                                AGREE_CELL[c.agreement],
                              )}
                              title={`+${c.support} / −${c.oppose} / ${c.of}`}
                            >
                              {c.agreement === "agreed" ? t.agreedShort : t.openShort}
                              <span className="num ml-1 opacity-70">
                                {c.support}/{c.of}
                              </span>
                            </span>
                            <ProposalMarks cell={c} t={t} />
                          </div>
                        </td>
                      ))}
                      <td className="max-w-56 px-3 py-2.5">
                        <HistoryCell cls={row.measureClass} rate={rate} t={t} lang={lang} />
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={n + 2} className="p-0">
                        <details className="group">
                          <summary className="cursor-pointer px-4 py-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                            {t.details}
                          </summary>
                          <TopicDetail row={row} runs={cmp.runs} rate={rate} lang={lang} t={t} />
                        </details>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Level min="analyst">
        <section className="rounded-2xl border bg-card shadow-xs" aria-label={t.runsTitle}>
          <div className="p-4 pb-2">
            <h2 className="text-base font-semibold">{t.runsTitle}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.runsSub}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t.col.run}</th>
                  <th className="px-3 py-2 font-medium">{t.col.seats}</th>
                  <th className="px-3 py-2 font-medium">{t.col.agreed}</th>
                  <th className="px-3 py-2 font-medium">{t.col.accepted}</th>
                  <th className="px-3 py-2 font-medium">{t.col.wait}</th>
                  <th className="px-3 py-2 font-medium">{t.col.cost}</th>
                  <th className="px-3 py-2 font-medium">{t.col.duration}</th>
                  <Level min="engineer">
                    <th className="px-3 py-2 font-medium">{t.col.tokens}</th>
                  </Level>
                </tr>
              </thead>
              <tbody>
                {cmp.runs.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-4 py-2.5">
                      <a href={`/runs/${r.id}`} className="font-medium hover:underline">
                        {runLabel(r, t)}
                      </a>
                      <Level min="engineer">
                        <div className="font-mono text-[11px] text-muted-foreground">{r.id}</div>
                      </Level>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <FamilyDot family={r.seatFamilies} />
                        {r.seatFamilies === "mixed" ? (
                          <span className="flex flex-wrap gap-0.5">
                            {Object.entries(r.seatModels).map(([a, m]) => (
                              <span
                                key={a}
                                className="inline-flex items-center gap-0.5 rounded border px-1 text-[10px]"
                                title={m}
                              >
                                {catalogAgent(a)?.code ?? a}
                                <FamilyDot family={familyOf(m)} className="size-1.5" />
                              </span>
                            ))}
                          </span>
                        ) : (
                          t.seatsLine(t.fam[r.seatFamilies] ?? r.seatFamilies)
                        )}
                      </span>
                      <Level min="engineer">
                        <div className="mt-1 font-mono text-[10px] leading-tight text-muted-foreground">
                          {[...new Set(Object.values(r.seatModels))].map((m) => (
                            <div key={m}>
                              {m}:{" "}
                              {Object.entries(r.seatModels)
                                .filter(([, x]) => x === m)
                                .map(([a]) => a)
                                .join(",")}
                            </div>
                          ))}
                        </div>
                      </Level>
                      {r.fallbackCalls > 0 ? (
                        <div className="mt-1 text-[11px] text-warning">
                          {t.fallback(r.fallbackCalls, r.seatCalls)}
                        </div>
                      ) : null}
                    </td>
                    <td className="num px-3 py-2.5">
                      {r.agreed}/{r.of}
                    </td>
                    <td className="num px-3 py-2.5">
                      {r.accepted}/{r.tabled}
                    </td>
                    <td className="num px-3 py-2.5">
                      {r.waitChangePct === null ? (
                        <span className="text-xs text-muted-foreground">{t.noFigure}</span>
                      ) : (
                        `${signed(r.waitChangePct, lang)} %`
                      )}
                    </td>
                    <td className="num px-3 py-2.5">
                      {r.costEurMio === null ? (
                        <span className="text-xs text-muted-foreground">{t.noFigure}</span>
                      ) : (
                        `${signed(r.costEurMio, lang, 0)} Mio. EUR`
                      )}
                    </td>
                    <td className="num px-3 py-2.5 text-muted-foreground">
                      {formatDuration(r.durationMs)}
                    </td>
                    <Level min="engineer">
                      <td className="num px-3 py-2.5 text-xs text-muted-foreground">
                        {r.costUsd === null
                          ? "–"
                          : `${Math.round(r.tokensIn / 1000)}k / ${Math.round(r.tokensOut / 1000)}k · ~${r.costUsd.toFixed(1)} USD`}
                      </td>
                    </Level>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground">
            {["gpt", "nova", "mixed"].map((f) => (
              <span key={f} className="inline-flex items-center gap-1">
                <FamilyDot family={f} /> {t.fam[f]}
              </span>
            ))}
            {excluded.length ? (
              <Level min="engineer">
                <span>
                  {t.excluded}:{" "}
                  {excluded.map((e) => `${e.id} (${t.excludedReason[e.reason]})`).join(", ")}
                </span>
              </Level>
            ) : null}
          </div>
        </section>
      </Level>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Level min="analyst">
          <section className="rounded-2xl border bg-card shadow-xs" aria-label={t.seatsTitle}>
            <div className="p-4 pb-2">
              <h2 className="text-base font-semibold">{t.seatsTitle}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.seatsSub}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t.col.institution}</th>
                    <th className="px-3 py-2 font-medium">{t.col.between}</th>
                    <th className="px-3 py-2 font-medium">{t.col.within}</th>
                    <th className="px-3 py-2 font-medium">{t.col.verdict}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cmp.seats]
                    .sort((a, b) => (b.betweenFamilies ?? -1) - (a.betweenFamilies ?? -1))
                    .map((s) => (
                      <SeatRow key={s.agentId} s={s} lang={lang} t={t} />
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </Level>

        <section className="rounded-2xl border bg-card p-4 shadow-xs" aria-label={t.histTitle}>
          <h2 className="text-base font-semibold">{t.histTitle}</h2>
          {overall ? (
            <p className="mt-2 text-sm">
              {t.histLead(overall.k, overall.n, Math.round((overall.k / overall.n) * 100))}
            </p>
          ) : null}
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-xs text-muted-foreground">
            {t.histPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Level min="engineer">
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              svforecast.cli forecast --measure-class &lt;c&gt; --proposer{" "}
              {hist.generatedFor.proposer} --date {hist.generatedFor.date} · baseline:{" "}
              {hist.baselineVerdict}
            </p>
          </Level>
        </section>
      </div>
    </div>
  );
}
