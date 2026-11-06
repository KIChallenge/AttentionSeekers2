"use client";

import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  catalogAgent,
  type LocalizedText,
  localize,
  type OutcomeClass,
  type RunSummary,
  TEMPLATES,
} from "@sv/contracts";
import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { laneT } from "@/components/entity/messages";
import { AgentTile } from "@/components/run/agent-tile";
import { OutcomeBadge } from "@/components/run/outcome-badge";
import { Eyebrow, Meta, Section, Stat } from "@/components/shell/page";
import { Level, usePrefs } from "@/components/shell/providers";
import { topicT } from "@/components/topics/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTableBody,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTableToolbar,
} from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatDuration } from "@/lib/format";
import { topicKeyOf } from "@/lib/topic-compare";
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
        {run.movedMost.pathLength.toFixed(1)}
      </span>
    </span>
  );
}

/** The reference run: one hero card, one primary action (open the negotiation). */
function Pinned({ d, forkAvailable }: { d: PinnedDetail; forkAvailable: boolean }) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  const r = d.summary;
  const template = TEMPLATES.find((x) => x.id === r.template);
  const maxLen = Math.max(0.1, ...d.movement.map((m) => m.len));
  return (
    <Section aria-label={base.dashboard.reference} className="p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Eyebrow>
              {base.dashboard.reference} · {t.dash.pinned}
            </Eyebrow>
            <Level min="engineer">
              <Meta className="font-mono">{r.id}</Meta>
            </Level>
          </div>
          <h2 className="max-w-3xl text-xl leading-snug font-semibold tracking-tight sm:text-2xl">
            {r.question}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <OutcomeBadge value={r.outcomeBadge} t={base} />
            {template ? (
              <Badge variant="outline" className="text-muted-foreground">
                {lang === "de" ? template.de : template.en}
              </Badge>
            ) : null}
            {d.endNote ? (
              <span className="text-sm text-muted-foreground">{localize(d.endNote, lang)}</span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Stat label={base.dashboard.agreement}>
              <AgreementMeter agreed={r.agreementShare.agreed} of={r.agreementShare.of} />
            </Stat>
            <Stat label={base.dashboard.proposals}>
              {r.acceptedProposals} {base.dashboard.accepted} · {r.rejectedProposals}{" "}
              {base.dashboard.rejected}
            </Stat>
            <Stat label={base.dashboard.rounds}>
              {r.roundsCompleted}/{r.roundLimit}
            </Stat>
            <Stat label={base.dashboard.duration}>{formatDuration(r.durationMs)}</Stat>
          </dl>
          <div>
            <div className="mb-2 text-xs text-muted-foreground">{t.replay.perTopic}</div>
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
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <Button asChild>
              <Link href={`/runs/${r.id}`}>{base.dashboard.open}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/replay/${r.id}`}>{base.dashboard.replay}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/topics/${topicKeyOf(r)}`}>{topicT(lang).compare}</Link>
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
        <div className="min-w-0 lg:border-l lg:pl-12">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <div className="text-xs text-muted-foreground">{base.dashboard.movedMost}</div>
            <Meta>
              {base.run.round} 1..{r.roundsCompleted}
            </Meta>
          </div>
          <ul className="space-y-2">
            {d.movement.map((m) => {
              const a = catalogAgent(m.agentId);
              return (
                <li
                  key={m.agentId}
                  className="grid grid-cols-[2.75rem_1fr_2.5rem] items-center gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <AgentTile agentId={m.agentId} />
                    <span className="truncate text-xs">{a?.code}</span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-gray-alpha-100">
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
    </Section>
  );
}

/** One quiet control per row: open, replay, compare and fork in a menu. */
function RowActions({ run: r, forkAvailable }: { run: RunSummary; forkAvailable: boolean }) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  return (
    <div className="flex justify-end">
      <ForkButton
        runId={r.id}
        rounds={r.roundsCompleted || r.roundLimit}
        agents={r.agents}
        available={forkAvailable}
        trigger={(openFork, canFork) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t.dash.more}>
                <HugeiconsIcon icon={MoreHorizontalIcon} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/runs/${r.id}`}>{base.dashboard.open}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/replay/${r.id}`}>{base.dashboard.replay}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/topics/${topicKeyOf(r)}`}>{topicT(lang).compare}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!canFork}
                title={canFork ? undefined : t.dash.forkUnavailable}
                onSelect={openFork}
              >
                {base.dashboard.fork}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </div>
  );
}

const arrayIncludesSome = (row: { getValue: (id: string) => unknown }, id: string, v: string[]) => {
  const cell = row.getValue(id);
  if (!v?.length) return true;
  if (Array.isArray(cell)) return cell.some((x) => v.includes(String(x)));
  return v.includes(String(cell));
};

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
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const variantLabel = (v: string) => (base.variant as Record<string, string>)[v] ?? v;
  const templateLabel = (v: string) => {
    const x = TEMPLATES.find((tt) => tt.id === v);
    return x ? (lang === "de" ? x.de : x.en) : v;
  };

  // columns are cheap to build and depend on language and level, so no memo
  const columns: ColumnDef<RunSummary>[] = [
    {
      id: "question",
      accessorKey: "question",
      header: () => t.dash.question,
      filterFn: (row, _id, v: string) =>
        !v ||
        row.original.question.toLowerCase().includes(v.toLowerCase()) ||
        row.original.id.includes(v),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="max-w-[32rem] min-w-[16rem] whitespace-normal">
            <Link href={`/runs/${r.id}`} className="line-clamp-2 font-medium hover:underline">
              {r.question}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {r.isReference ? (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  {base.dashboard.reference}
                </Badge>
              ) : null}
              <span>{variantLabel(r.variantKind)}</span>
              <Level min="engineer">
                <span className="font-mono">
                  · {r.id} · {r.agents.length} · {r.models.length} models
                </span>
              </Level>
            </div>
          </div>
        );
      },
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t.dash.date} />,
      cell: ({ row }) => (
        <span className="num whitespace-nowrap">{formatDate(row.original.createdAt, lang)}</span>
      ),
    },
    {
      id: "outcome",
      accessorKey: "outcomeBadge",
      header: () => t.dash.outcome,
      cell: ({ row }) => <OutcomeBadge value={row.original.outcomeBadge} t={base} />,
    },
    {
      id: "agreement",
      accessorFn: (r) => r.agreementShare.agreed / Math.max(1, r.agreementShare.of),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={base.dashboard.agreement} />
      ),
      cell: ({ row }) => (
        <AgreementMeter
          agreed={row.original.agreementShare.agreed}
          of={row.original.agreementShare.of}
        />
      ),
    },
    {
      id: "moved",
      accessorFn: (r) => r.movedMost?.pathLength ?? 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={base.dashboard.movedMost} />
      ),
      cell: ({ row }) => <Moved run={row.original} lang={lang} />,
    },
    {
      id: "duration",
      accessorKey: "durationMs",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={base.dashboard.duration} />
      ),
      cell: ({ row }) => (
        <span className="num whitespace-nowrap">{formatDuration(row.original.durationMs)}</span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{t.dash.actions}</span>,
      enableSorting: false,
      cell: ({ row }) => <RowActions run={row.original} forkAvailable={forkAvailable} />,
    },
    // filter-only columns (hidden): variant, template, status, models
    {
      id: "variant",
      accessorKey: "variantKind",
      filterFn: arrayIncludesSome,
      enableHiding: true,
    },
    { id: "template", accessorKey: "template", filterFn: arrayIncludesSome },
    { id: "status", accessorKey: "status", filterFn: arrayIncludesSome },
    { id: "models", accessorKey: "models", filterFn: arrayIncludesSome },
  ];

  const table = useReactTable({
    data: runs,
    columns,
    state: { sorting, columnFilters, columnVisibility: hidden },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const variants = useMemo(() => [...new Set(runs.map((r) => r.variantKind))], [runs]);
  const templates = useMemo(() => [...new Set(runs.map((r) => r.template))], [runs]);
  const models = useMemo(() => [...new Set(runs.flatMap((r) => r.models))].sort(), [runs]);
  const modelCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of runs) for (const id of r.models) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [runs]);
  const consensus = runs.filter((r) => r.outcomeBadge === "consensus").length;
  const topicsAgreed = runs.reduce((n, r) => n + r.agreementShare.agreed, 0);
  const topicsAll = runs.reduce((n, r) => n + r.agreementShare.of, 0);
  const shown = table.getFilteredRowModel().rows.length;

  // The totals are a caption of the table, not a block of their own: with a handful of
  // runs they are orientation, not a result.
  const totals = [
    shown === runs.length
      ? `${runs.length} ${t.dash.stats.runs}`
      : `${shown}/${runs.length} ${t.dash.stats.runs}`,
    `${consensus} ${t.dash.stats.consensus}`,
    `${topicsAgreed}/${topicsAll} ${t.dash.stats.topics}`,
    `${models.length} ${t.dash.stats.models}`,
  ].join(" · ");

  const facet = {
    noResults: t.dash.noResults,
    clearLabel: t.dash.clear,
    selectedLabel: (n: number) => t.dash.selected.replace("{n}", String(n)),
  };

  return (
    <>
      {pinned ? <Pinned d={pinned} forkAvailable={forkAvailable} /> : null}

      <Section
        variant="plain"
        title={t.dash.allRuns}
        aria-label={t.dash.allRuns}
        bodyClassName="space-y-4"
      >
        <DataTableToolbar
          table={table}
          search={{ column: "question", placeholder: t.dash.search, label: t.dash.search }}
          resetLabel={t.dash.reset}
        >
          <DataTableFacetedFilter
            column={table.getColumn("variant")}
            title={t.dash.filterVariant}
            options={variants.map((v) => ({ value: v, label: variantLabel(v) }))}
            {...facet}
          />
          <DataTableFacetedFilter
            column={table.getColumn("template")}
            title={t.dash.filterTemplate}
            options={templates.map((v) => ({ value: v, label: templateLabel(v) }))}
            {...facet}
          />
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title={t.dash.filterStatus}
            options={(["running", "completed", "failed"] as const).map((v) => ({
              value: v,
              label: t.dash.status[v],
            }))}
            {...facet}
          />
          <DataTableFacetedFilter
            column={table.getColumn("models")}
            title={t.dash.filterModel}
            options={models.map((m) => ({ value: m, label: m }))}
            counts={modelCounts}
            {...facet}
          />
        </DataTableToolbar>

        {/* table at desktop widths */}
        <div className="hidden lg:block">
          <DataTableBody
            table={table}
            caption={totals}
            empty={runs.length === 0 ? base.dashboard.empty : t.dash.none}
            rowProps={(r) => ({ "data-run": r.id })}
          />
        </div>

        {/* cards below lg */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
          {table.getRowModel().rows.map(({ original: r }) => (
            <article
              key={r.id}
              className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
              data-run={r.id}
            >
              <div className="flex items-center gap-1.5">
                <OutcomeBadge value={r.outcomeBadge} t={base} />
                <span className="flex-1" />
                <Meta>{formatDate(r.createdAt, lang)}</Meta>
              </div>
              <Link href={`/runs/${r.id}`} className="leading-snug font-medium hover:underline">
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
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/topics/${topicKeyOf(r)}`}>{topicT(lang).compare}</Link>
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
          {shown === 0 ? (
            <p className="text-sm text-muted-foreground">
              {runs.length === 0 ? base.dashboard.empty : t.dash.none}
            </p>
          ) : null}
        </div>
        <Meta className="lg:hidden">{totals}</Meta>
      </Section>
    </>
  );
}

const hidden = { variant: false, template: false, status: false, models: false };
