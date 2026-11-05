"use client";

import Link from "next/link";
import { Chip, Panel } from "@/components/run/bits";
import { L } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { CoalitionGraph, IncentiveMatrix } from "./coalitions";
import { ConsensusMatrix } from "./consensus-matrix";
import { OpenConflicts, ProposalList, WhoMoved } from "./movement";
import { TrajectoryChart } from "./trajectory-chart";

export function AnalysisView() {
  const { snap, t, lang, runId } = useRun();
  const last = Math.max(1, snap.summaries.length);
  const openCount = snap.summaries.at(-1)?.openConflicts.length ?? 0;
  return (
    <main className="mx-auto max-w-[1800px] px-4 sm:px-6 pt-5 pb-12">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.analysis.title}</h1>
          {/* The end condition is the one sentence that frames every chart below. */}
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {snap.endCondition
              ? `${t.analysis.endCondition}: ${L(snap.endCondition.note, lang)}`
              : t.analysis.sub}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/runs/${runId}/outcome`}
            className="rounded-control border px-3 py-1.5 text-sm hover:border-foreground/40"
          >
            {t.nav.outcome}
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <Panel title={t.analysis.trajectory}>
            <TrajectoryChart />
          </Panel>
          <Panel title={t.analysis.matrix}>
            <ConsensusMatrix />
          </Panel>
          <details className="group rounded-2xl border bg-card p-4 shadow-xs">
            <summary className="cursor-pointer marker:content-none">
              <span className="mr-1.5 inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90">
                ▸
              </span>
              <span className="text-base font-semibold">{t.analysis.incentiveMatrix}</span>
              <span className="ml-2 text-xs text-muted-foreground">{t.analysis.incentiveSub}</span>
            </summary>
            <div className="mt-3">
              <IncentiveMatrix />
            </div>
          </details>
          <Panel title={t.analysis.proposals} sub={t.analysis.proposalsSub}>
            <ProposalList />
          </Panel>
        </div>
        <div className="min-w-0 space-y-4">
          <Panel title={t.analysis.whoMoved} sub={t.analysis.whoMovedSub(last)}>
            <WhoMoved />
          </Panel>
          <Panel
            title={t.analysis.conflicts}
            aside={<Chip className="border-warning/40 text-warning">{openCount}</Chip>}
          >
            <OpenConflicts />
          </Panel>
          <Panel
            title={t.analysis.coalitionGraph}
            sub={t.analysis.coalitionSub(snap.calculi.at(-1)?.round ?? last)}
          >
            <CoalitionGraph />
          </Panel>
        </div>
      </div>
    </main>
  );
}
