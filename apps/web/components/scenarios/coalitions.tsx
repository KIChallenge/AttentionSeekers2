"use client";

import { catalogAgent, localize } from "@sv/contracts";
import { AgentTile } from "@/components/run/agent-tile";
import { EmptyState, Meta, Section } from "@/components/shell/page";
import { usePrefs } from "@/components/shell/providers";
import { Badge } from "@/components/ui/badge";
import type { CoalitionPatterns, ProposalVerdict } from "@/lib/scenario-insights";
import { cn } from "@/lib/utils";
import { scenarioT } from "./messages";

type Lang = "de" | "en";

const nameOf = (id: string, lang: Lang) => {
  const a = catalogAgent(id);
  return a ? (lang === "de" ? a.nameDe : a.glossEn) : id;
};

function Tiles({ ids }: { ids: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {ids.map((id) => (
        <AgentTile key={id} agentId={id} />
      ))}
    </span>
  );
}

/** Agents by agents: the share of votes on which both stood on the same side. */
function Matrix({ cp }: { cp: CoalitionPatterns }) {
  const { lang } = usePrefs();
  const t = scenarioT(lang).coalitions;
  const { agentIds, same, both } = cp.matrix;
  // Shares cluster (most pairs agree on 60 to 80 percent of votes), so the tint spans the
  // observed range instead of 0..1; the numbers stay absolute.
  const shares = agentIds.flatMap((_, i) =>
    agentIds.flatMap((_, j) => {
      const b = both[i]?.[j] ?? 0;
      return i !== j && b ? [(same[i]?.[j] ?? 0) / b] : [];
    }),
  );
  const lo = Math.min(...shares, 1);
  const hi = Math.max(...shares, 0);
  const tint = (share: number) =>
    hi > lo ? Math.round(((share - lo) / (hi - lo)) * 60) : Math.round(share * 60);
  return (
    <div className="overflow-x-auto">
      <table className="num text-xs" aria-label={t.matrix}>
        <thead>
          <tr>
            <th className="p-1" />
            {agentIds.map((id) => (
              <th key={id} className="p-1 text-center font-normal" title={nameOf(id, lang)}>
                <AgentTile agentId={id} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agentIds.map((row, i) => (
            <tr key={row}>
              <th className="p-1 pr-2 text-left font-normal whitespace-nowrap">
                <AgentTile agentId={row} withName lang={lang} />
              </th>
              {agentIds.map((col, j) => {
                if (i === j) return <td key={col} className="p-1" />;
                const s = same[i]?.[j] ?? 0;
                const b = both[i]?.[j] ?? 0;
                const share = b ? s / b : 0;
                return (
                  <td key={col} className="p-1">
                    <div
                      title={t.cellTitle(nameOf(row, lang), nameOf(col, lang), s, b)}
                      className={cn(
                        "flex h-8 w-11 items-center justify-center rounded-md border text-[11px]",
                        b === 0 && "border-dashed text-muted-foreground",
                      )}
                      style={
                        b
                          ? {
                              background: `color-mix(in oklab, var(--success) ${tint(share)}%, var(--card))`,
                            }
                          : undefined
                      }
                    >
                      {b ? `${s}/${b}` : "–"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Verdicts({ rows, labels }: { rows: ProposalVerdict[]; labels: Record<string, string> }) {
  const { lang } = usePrefs();
  const t = scenarioT(lang).coalitions;
  const byRun = new Map<string, ProposalVerdict[]>();
  for (const v of rows) byRun.set(v.runId, [...(byRun.get(v.runId) ?? []), v]);
  return (
    <div className="flex flex-col gap-3">
      {[...byRun.entries()].map(([runId, vs], i) => (
        <details key={runId} className="group rounded-2xl border bg-card" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-baseline gap-3 px-5 py-3 text-sm font-medium">
            <span>{labels[runId] ?? runId}</span>
            <Meta>{t.runs(vs.length)}</Meta>
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">{t.proposal}</th>
                  <th className="px-3 py-2 font-medium">{t.status}</th>
                  <th className="px-3 py-2 font-medium">{t.mwc}</th>
                  <th className="px-3 py-2 font-medium">{t.blockedBy}</th>
                </tr>
              </thead>
              <tbody>
                {vs.map((v) => (
                  <tr key={v.proposalId} className="border-t align-top">
                    <td className="max-w-md px-5 py-2.5">
                      <div className="leading-snug">{localize(v.title, lang)}</div>
                      <Meta>{t.round(v.round)}</Meta>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          v.status === "accepted"
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-destructive/30 text-destructive",
                        )}
                      >
                        {t[v.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {v.minimalWinningCoalitions.length ? (
                        <div className="flex flex-col gap-1">
                          {v.minimalWinningCoalitions.slice(0, 4).map((c) => (
                            <Tiles key={c.join("-")} ids={c} />
                          ))}
                          {v.minimalWinningCoalitions.length > 4 ? (
                            <Meta>+{v.minimalWinningCoalitions.length - 4}</Meta>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {v.blockers.length ? t.none : t.noCalculus}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {v.blockers.length ? (
                        <Tiles ids={v.blockers} />
                      ) : (
                        <span className="text-xs text-muted-foreground">{t.none}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

export function Coalitions({
  cp,
  labels,
}: {
  cp: CoalitionPatterns;
  labels: Record<string, string>;
}) {
  const { lang } = usePrefs();
  const t = scenarioT(lang).coalitions;
  if (cp.verdicts.length === 0 && cp.pairs.length === 0) return <EmptyState title={t.noData} />;
  return (
    <>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title={t.matrix} description={t.matrixHint} prose aria-label={t.matrix}>
          <Matrix cp={cp} />
        </Section>
        <div className="flex flex-col gap-8">
          <Section title={t.pairs} aria-label={t.pairs}>
            <ul className="flex flex-col gap-2 text-sm">
              {cp.pairs.slice(0, 6).map((p) => (
                <li
                  key={`${p.a}-${p.b}`}
                  className="flex items-start justify-between gap-3"
                  title={`${nameOf(p.a, lang)} · ${nameOf(p.b, lang)}`}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <Tiles ids={[p.a, p.b]} />
                    <span className="text-xs leading-snug">
                      {nameOf(p.a, lang)} · {nameOf(p.b, lang)}
                    </span>
                  </span>
                  <Meta className="shrink-0 text-right">{t.pairsOf(p.same, p.both)}</Meta>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={t.blockers} aria-label={t.blockers}>
            {cp.blockers.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {cp.blockers.slice(0, 6).map((b) => (
                  <li key={b.agentId} className="flex items-center gap-3">
                    <AgentTile
                      agentId={b.agentId}
                      withName
                      lang={lang}
                      className="min-w-0 flex-1"
                    />
                    <Meta>{t.blockersOf(b.count, b.of)}</Meta>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t.none}</p>
            )}
          </Section>
        </div>
      </div>
      <Section variant="plain" title={t.proposals} aria-label={t.proposals}>
        <Verdicts rows={cp.verdicts} labels={labels} />
      </Section>
    </>
  );
}
