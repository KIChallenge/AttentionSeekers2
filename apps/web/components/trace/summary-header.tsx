"use client";

import type { Lang } from "@sv/contracts";
import { Chip } from "@/components/run/bits";
import { cn } from "@/lib/utils";
import { fmtCompact, fmtInt, fmtMs, fmtPct, fmtUsd } from "./format";
import { familyColor, type TraceTotals } from "./model";
import type { TraceStrings } from "./strings";

function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border bg-background px-3 py-2", className)}>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="num text-lg font-semibold tabular-nums">{value}</div>
      {sub ? <div className="truncate text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** Readable at analyst level: one plain sentence, six numbers, two share bars. */
export function SummaryHeader({
  totals,
  lang,
  t,
  derived,
}: {
  totals: TraceTotals;
  lang: Lang;
  t: TraceStrings;
  derived: boolean;
}) {
  const s = t.summary;
  const cost = fmtUsd(totals.costUsd, lang);
  const famTotal = totals.byFamily.reduce((a, f) => a + f.calls, 0) || 1;
  const kindMs = totals.byKind.reduce((a, k) => a + k.ms, 0) || 1;
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-xs" aria-label={s.calls}>
      <p className="mb-3 text-sm">
        {s.plain(totals.calls, fmtMs(totals.wallMs, lang), cost, totals.byFamily.length)}
        {derived ? <Chip className="ml-2 border-dashed">{t.derived}</Chip> : null}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat
          label={s.calls}
          value={fmtInt(totals.calls, lang)}
          sub={totals.markers ? s.markers(totals.markers) : undefined}
        />
        <Stat label={s.wall} value={fmtMs(totals.wallMs, lang)} />
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
        <Stat
          label={s.cost}
          value={cost}
          sub={totals.unpriced ? s.unpriced(totals.unpriced) : s.costNote}
        />
        <Stat
          label={s.reliability}
          value={`${totals.fallbacks + totals.repairs + totals.failed}`}
          sub={[
            s.fallbacks(totals.fallbacks),
            s.repairs(totals.repairs),
            s.failed(totals.failed),
          ].join(" · ")}
        />
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
                className="border-r border-card last:border-r-0"
                style={{
                  width: `${(k.ms / kindMs) * 100}%`,
                  background: `color-mix(in oklab, var(--foreground) ${70 - i * 9}%, transparent)`,
                }}
                title={`${t.kind[k.kind]}: ${fmtMs(k.ms, lang)}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {totals.byKind.map((k, i) => (
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
