"use client";

import {
  catalogAgent,
  type LocalizedText,
  localize,
  type OutcomeClass,
  type RunSummary,
  TEMPLATES,
} from "@sv/contracts";
import Link from "next/link";
import { useMemo, useState } from "react";
import { laneT } from "@/components/entity/messages";
import { AgentTile } from "@/components/run/agent-tile";
import { OutcomeBadge } from "@/components/run/outcome-badge";
import { Level, usePrefs } from "@/components/shell/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ForkButton } from "./fork-button";

export interface PinnedDetail {
  summary: RunSummary;
  topics: Array<{
    id: string;
    label: LocalizedText;
    status: OutcomeClass;
    support: number;
    oppose: number;
    of: number;
  }>;
  movement: Array<{ agentId: string; len: number }>;
  endNote: LocalizedText | null;
}

const STATUS_CELL: Record<OutcomeClass, string> = {
  consensus: "border-success/40 bg-success/10 text-success",
  majority: "border-border bg-gray-alpha-100 text-foreground",
  minority: "border-warning/40 bg-warning/10 text-warning",
  no_result: "border-dashed text-muted-foreground",
};

function AgreementMeter({ agreed, of }: { agreed: number; of: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num">
        {agreed}/{of}
      </span>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: of }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length meter
            key={i}
            className={cn(
              "h-2.5 w-1.5 rounded-[2px]",
              i < agreed ? "bg-foreground" : "bg-gray-alpha-200",
            )}
          />
        ))}
      </span>
    </span>
  );
}

function Moved({ run, lang }: { run: RunSummary; lang: "de" | "en" }) {
  const a = run.movedMost ? catalogAgent(run.movedMost.agentId) : null;
  if (!a || !run.movedMost) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <AgentTile agentId={a.id} />
      <span className="truncate">{lang === "de" ? a.nameDe : a.glossEn}</span>
      <span className="num text-xs whitespace-nowrap text-muted-foreground">
        Σ|Δ| {run.movedMost.pathLength.toFixed(1)}
      </span>
    </span>
  );
}

function Pinned({ d, forkAvailable }: { d: PinnedDetail; forkAvailable: boolean }) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  const r = d.summary;
  const template = TEMPLATES.find((x) => x.id === r.template);
  const maxLen = Math.max(0.1, ...d.movement.map((m) => m.len));
  return (
    <section
      className="overflow-hidden rounded-2xl border bg-card shadow-xs"
      aria-label={base.dashboard.reference}
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-gray-alpha-50 px-5 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className="size-1.5 rounded-full bg-foreground" />
          {t.dash.pinned} · {base.dashboard.reference}
        </span>
        <span className="text-muted-foreground">{t.dash.referenceLead}</span>
        <span className="flex-1" />
        <Level min="engineer">
          <span className="font-mono text-muted-foreground">{r.id}</span>
        </Level>
      </div>
      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Outcome and template only; variant and end condition are in the end note. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <OutcomeBadge value={r.outcomeBadge} t={base} />
            {template ? (
              <Badge variant="outline" className="text-muted-foreground">
                {lang === "de" ? template.de : template.en}
              </Badge>
            ) : null}
          </div>
          <h2 className="text-xl leading-snug">{r.question}</h2>
          {d.endNote ? (
            <p className="text-sm text-muted-foreground">{localize(d.endNote, lang)}</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{base.dashboard.agreement}</dt>
              <dd className="mt-1">
                <AgreementMeter agreed={r.agreementShare.agreed} of={r.agreementShare.of} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{base.dashboard.proposals}</dt>
              <dd className="num mt-1">
                {r.acceptedProposals} {base.dashboard.accepted} · {r.rejectedProposals}{" "}
                {base.dashboard.rejected}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{base.dashboard.rounds}</dt>
              <dd className="num mt-1">
                {r.roundsCompleted}/{r.roundLimit}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{base.dashboard.duration}</dt>
              <dd className="num mt-1">{formatDuration(r.durationMs)}</dd>
            </div>
          </dl>
          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">{t.replay.perTopic}</div>
            <div className="flex flex-wrap gap-1.5">
              {d.topics.map((tp) => (
                <span
                  key={tp.id}
                  className={cn("rounded-md border px-2 py-1 text-xs", STATUS_CELL[tp.status])}
                  title={`${base.outcome[tp.status]}: +${tp.support} / -${tp.oppose} / ${tp.of}`}
                >
                  {localize(tp.label, lang)}
                  <span className="num ml-1.5 opacity-70">
                    {tp.support}/{tp.of}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button asChild>
              <Link href={`/replay/${r.id}`}>{base.dashboard.replay}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/runs/${r.id}`}>{base.dashboard.open}</Link>
            </Button>
            <ForkButton
              runId={r.id}
              rounds={r.roundsCompleted || r.roundLimit}
              agents={r.agents}
              available={forkAvailable}
              size="sm"
            />
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
            <span>{base.dashboard.movedMost}</span>
            <span className="num">
              Σ|Δ| {base.run.round} 1..{r.roundsCompleted}
            </span>
          </div>
          <ul className="space-y-1.5">
            {d.movement.map((m) => {
              const a = catalogAgent(m.agentId);
              return (
                <li
                  key={m.agentId}
                  className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <AgentTile agentId={m.agentId} />
                    <span className="truncate text-xs">{a?.code}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-gray-alpha-100">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(m.len / maxLen) * 100}%`,
                        background: a?.color ?? "var(--foreground)",
                      }}
                    />
                  </span>
                  <span className="num text-right text-xs text-muted-foreground">
                    {m.len.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

const ALL = "__all";

export function Dashboard({
  runs,
  pinned,
  forkAvailable,
}: {
  runs: RunSummary[];
  pinned: PinnedDetail | null;
  forkAvailable: boolean;
}) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  const [q, setQ] = useState("");
  const [variant, setVariant] = useState(ALL);
  const [template, setTemplate] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [model, setModel] = useState(ALL);

  const variants = useMemo(() => [...new Set(runs.map((r) => r.variantKind))], [runs]);
  const templates = useMemo(() => [...new Set(runs.map((r) => r.template))], [runs]);
  const models = useMemo(() => [...new Set(runs.flatMap((r) => r.models))].sort(), [runs]);
  const filtered = runs.filter(
    (r) =>
      (!q || r.question.toLowerCase().includes(q.toLowerCase()) || r.id.includes(q)) &&
      (variant === ALL || r.variantKind === variant) &&
      (template === ALL || r.template === template) &&
      (status === ALL || r.status === status) &&
      (model === ALL || r.models.includes(model)),
  );
  const consensus = runs.filter((r) => r.outcomeBadge === "consensus").length;
  const topicsAgreed = runs.reduce((n, r) => n + r.agreementShare.agreed, 0);
  const topicsAll = runs.reduce((n, r) => n + r.agreementShare.of, 0);

  const filterSelect = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: Array<{ value: string; label: string }>,
  ) => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger size="sm" className="min-w-36" aria-label={label}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t.dash.any}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // The totals are one quiet line, not four tiles: with a handful of runs they are
  // orientation, not a result. The setup and archive entry points live in the top bar.
  const totals = [
    `${runs.length} ${t.dash.stats.runs}`,
    `${consensus} ${t.dash.stats.consensus}`,
    `${topicsAgreed}/${topicsAll} ${t.dash.stats.topics}`,
    `${models.length} ${t.dash.stats.models}`,
  ].join(" · ");

  return (
    <div className="space-y-6">
      {pinned ? <Pinned d={pinned} forkAvailable={forkAvailable} /> : null}

      <section aria-label={t.dash.allRuns} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base">{t.dash.allRuns}</h2>
          <span className="num mr-2 text-xs text-muted-foreground">{totals}</span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.dash.search}
            className="h-8 w-full sm:w-64"
          />
          {filterSelect(
            t.dash.filterVariant,
            variant,
            setVariant,
            variants.map((v) => ({
              value: v,
              label: (base.variant as Record<string, string>)[v] ?? v,
            })),
          )}
          {filterSelect(
            t.dash.filterTemplate,
            template,
            setTemplate,
            templates.map((v) => {
              const x = TEMPLATES.find((tt) => tt.id === v);
              return { value: v, label: x ? (lang === "de" ? x.de : x.en) : v };
            }),
          )}
          {filterSelect(
            t.dash.filterStatus,
            status,
            setStatus,
            (["running", "completed", "failed"] as const).map((v) => ({
              value: v,
              label: t.dash.status[v],
            })),
          )}
          {filterSelect(
            t.dash.filterModel,
            model,
            setModel,
            models.map((m) => ({ value: m, label: m })),
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            {runs.length === 0 ? base.dashboard.empty : t.dash.none}
          </div>
        ) : (
          <>
            {/* table at desktop widths */}
            <div className="hidden overflow-hidden rounded-2xl border bg-card lg:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-alpha-50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-normal">{t.dash.question}</th>
                    <th className="px-3 py-2 font-normal">{t.dash.date}</th>
                    <th className="px-3 py-2 font-normal">{t.dash.outcome}</th>
                    <th className="px-3 py-2 font-normal">{base.dashboard.agreement}</th>
                    <th className="px-3 py-2 font-normal">{base.dashboard.movedMost}</th>
                    <th className="px-3 py-2 font-normal">{base.dashboard.duration}</th>
                    <th className="px-3 py-2 font-normal">
                      <span className="sr-only">{t.dash.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-gray-alpha-50"
                      data-run={r.id}
                    >
                      <td className="max-w-[28rem] px-4 py-3">
                        <Link href={`/runs/${r.id}`} className="line-clamp-2 hover:underline">
                          {r.question}
                        </Link>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {r.isReference ? (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                              {base.dashboard.reference}
                            </Badge>
                          ) : null}
                          <span>
                            {(base.variant as Record<string, string>)[r.variantKind] ??
                              r.variantKind}
                          </span>
                          <Level min="engineer">
                            <span className="font-mono">
                              · {r.id} · {r.agents.length} · {r.models.length} models
                            </span>
                          </Level>
                        </div>
                      </td>
                      <td className="num px-3 py-3 whitespace-nowrap">
                        {formatDate(r.createdAt, lang)}
                      </td>
                      <td className="px-3 py-3">
                        <OutcomeBadge value={r.outcomeBadge} t={base} />
                      </td>
                      <td className="px-3 py-3">
                        <AgreementMeter agreed={r.agreementShare.agreed} of={r.agreementShare.of} />
                      </td>
                      <td className="max-w-52 px-3 py-3">
                        <Moved run={r} lang={lang} />
                      </td>
                      <td className="num px-3 py-3 whitespace-nowrap">
                        {formatDuration(r.durationMs)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/replay/${r.id}`}>{base.dashboard.replay}</Link>
                          </Button>
                          <ForkButton
                            runId={r.id}
                            rounds={r.roundsCompleted || r.roundLimit}
                            agents={r.agents}
                            available={forkAvailable}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* cards below lg */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
              {filtered.map((r) => (
                <article
                  key={r.id}
                  className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
                  data-run={r.id}
                >
                  <div className="flex items-center gap-1.5">
                    <OutcomeBadge value={r.outcomeBadge} t={base} />
                    <span className="flex-1" />
                    <span className="num text-xs text-muted-foreground">
                      {formatDate(r.createdAt, lang)}
                    </span>
                  </div>
                  <Link href={`/runs/${r.id}`} className="leading-snug hover:underline">
                    {r.question}
                  </Link>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <AgreementMeter agreed={r.agreementShare.agreed} of={r.agreementShare.of} />
                    <span className="num text-right">{formatDuration(r.durationMs)}</span>
                  </div>
                  <div className="text-sm">
                    <Moved run={r} lang={lang} />
                  </div>
                  <div className="flex gap-1">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/replay/${r.id}`}>{base.dashboard.replay}</Link>
                    </Button>
                    <ForkButton
                      runId={r.id}
                      rounds={r.roundsCompleted || r.roundLimit}
                      agents={r.agents}
                      available={forkAvailable}
                    />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
