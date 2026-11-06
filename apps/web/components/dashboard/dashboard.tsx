"use client";

import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { catalogAgent, type RunSummary } from "@sv/contracts";
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
import { scenarioT } from "@/components/scenarios/messages";
import { Meta, Section } from "@/components/shell/page";
import { Level, usePrefs } from "@/components/shell/providers";
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
import { cn } from "@/lib/utils";
import { ForkButton } from "./fork-button";

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

/** One quiet control per row: open, replay, stage and fork in a menu. */
function RowActions({ run: r, forkAvailable }: { run: RunSummary; forkAvailable: boolean }) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  const s = scenarioT(lang);
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
                <Link href={`/runs/${r.id}/stage`}>{s.stage}</Link>
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

/** Runs of one scenario as a data table (cards below lg) with filters in the toolbar. */
export function RunsTable({
  runs,
  labels = {},
  forkAvailable,
  title,
}: {
  runs: RunSummary[];
  /** Short name per run (reference, ensemble label); rows without one show the question. */
  labels?: Record<string, string>;
  forkAvailable: boolean;
  /** Section title; null renders the table without a title row (inside a tab). */
  title?: string | null;
}) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  const s = scenarioT(lang);
  const hasLabels = Object.keys(labels).length > 0;
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const variantLabel = (v: string) => (base.variant as Record<string, string>)[v] ?? v;

  // columns are cheap to build and depend on language and level, so no memo
  const columns: ColumnDef<RunSummary>[] = [
    {
      id: "question",
      accessorKey: "question",
      header: () => (hasLabels ? t.dash.run : t.dash.question),
      filterFn: (row, _id, v: string) =>
        !v ||
        row.original.question.toLowerCase().includes(v.toLowerCase()) ||
        (labels[row.original.id] ?? "").toLowerCase().includes(v.toLowerCase()) ||
        row.original.id.includes(v),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="max-w-[32rem] min-w-[16rem] whitespace-normal">
            <Link
              href={`/runs/${r.id}`}
              className="line-clamp-2 font-medium hover:underline"
              title={r.question}
            >
              {labels[r.id] ?? r.question}
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
    // filter-only columns (hidden): variant, status, models
    {
      id: "variant",
      accessorKey: "variantKind",
      filterFn: arrayIncludesSome,
      enableHiding: true,
    },
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
    <Section
      variant="plain"
      title={title === null ? undefined : (title ?? t.dash.allRuns)}
      aria-label={title ?? t.dash.allRuns}
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
            <Link
              href={`/runs/${r.id}`}
              className="leading-snug font-medium hover:underline"
              title={r.question}
            >
              {labels[r.id] ?? r.question}
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
                <Link href={`/runs/${r.id}/stage`}>{s.stage}</Link>
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
  );
}

const hidden = { variant: false, status: false, models: false };
