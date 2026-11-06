"use client";

import type { Lang } from "@sv/contracts";
import { cn } from "@/lib/utils";
import { fmtCompact, fmtMs, fmtPct, fmtUsd } from "./format";
import { familyColor, type TraceTotals } from "./model";
import type { TraceStrings } from "./strings";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="num text-lg font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-[11px] leading-snug text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/**
 * Reliability in one sentence with one accent: destructive when a call failed, warning when
 * one fell back to another model, quiet for repairs, success when nothing went wrong.
 */
function Reliability({ totals, t }: { totals: TraceTotals; t: TraceStrings }) {
  const s = t.summary;
  const parts: string[] = [];
  if (totals.failed) parts.push(s.failed(totals.failed));
  if (totals.fallbacks) parts.push(s.fallbacks(totals.fallbacks));
  if (totals.repairs) parts.push(s.repairs(totals.repairs));
  if (parts.length === 0) return <span className="text-success">{s.allGood}</span>;
  const tone = totals.failed
    ? "text-destructive"
    : totals.fallbacks
      ? "text-warning"
      : "text-muted-foreground";
  return (
    <span className={tone} title={totals.repairs ? s.repairedNote : undefined}>
      {s.issues(parts)}
    </span>
  );
}

/** Readable at every level: two plain sentences, four numbers, two share bars. */
export function SummaryHeader({
  totals,
  lang,
  t,
}: {
  totals: TraceTotals;
  lang: Lang;
  t: TraceStrings;
}) {
  const s = t.summary;
  const cost = fmtUsd(totals.costUsd, lang);
  const famTotal = totals.byFamily.reduce((a, f) => a + f.calls, 0) || 1;
  const kindMs = totals.byKind.reduce((a, k) => a + k.ms, 0) || 1;
  const costSub = totals.unpriced ? `${s.costNote}; ${s.unpriced(totals.unpriced)}` : s.costNote;
  const callsSub = totals.markers ? s.markers(totals.markers) : undefined;
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-none sm:p-6" aria-label={s.calls}>
      <p className="mb-5 text-sm leading-relaxed">
        {s.plain(totals.calls, fmtMs(totals.wallMs, lang), cost, totals.byFamily.length)}{" "}
        <Reliability totals={totals} t={t} />
      </p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={s.wall} value={fmtMs(totals.wallMs, lang)} sub={callsSub} />
        <Stat
          label={s.tokensIn}
          value={fmtCompact(totals.tokensIn, lang)}
          sub={`${s.cached}: ${fmtCompact(totals.tokensCached, lang)}`}
        />
        <Stat
          label={s.tokensOut}
          value={fmtCompact(totals.tokensOut, lang)}
          sub={`${s.reasoning}: ${fmtCompact(totals.tokensReasoning, lang)}`}
        />
        <Stat label={s.cost} value={cost} sub={costSub} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">{s.families}</div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-alpha-100">
            {totals.byFamily.map((f) => (
              <span
                key={f.family}
                style={{
                  width: `${(f.calls / famTotal) * 100}%`,
                  background: familyColor(f.family),
                }}
                title={`${f.family}: ${f.calls}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {totals.byFamily.map((f) => (
              <span key={f.family} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-[2px]"
                  style={{ background: familyColor(f.family) }}
                />
                <span className="font-medium">{f.family}</span>
                <span className="text-muted-foreground tabular-nums">
                  {fmtPct(f.calls / famTotal)} · {fmtCompact(f.tokens, lang)} ·{" "}
                  {fmtUsd(f.costUsd, lang)}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">{s.timeSplit}</div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-alpha-100">
            {totals.byKind.map((k, i) => (
              <span
                key={k.kind}
                className={cn("border-r border-card last:border-r-0", k.ms === 0 && "hidden")}
                style={{
                  width: `${(k.ms / kindMs) * 100}%`,
                  background: `color-mix(in oklab, var(--foreground) ${70 - i * 9}%, transparent)`,
                }}
                title={`${t.kind[k.kind]}: ${fmtMs(k.ms, lang)}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {totals.byKind
              .filter((k) => k.ms > 0)
              .map((k, i) => (
                <span key={k.kind} className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-[2px]"
                    style={{
                      background: `color-mix(in oklab, var(--foreground) ${70 - i * 9}%, transparent)`,
                    }}
                  />
                  <span className="font-medium">{t.kind[k.kind]}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {k.calls} · {fmtPct(k.ms / kindMs)}
                  </span>
                </span>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}
