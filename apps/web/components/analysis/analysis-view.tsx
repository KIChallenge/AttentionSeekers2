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
    <main className="mx-auto max-w-[1800px] px-6 pt-5 pb-12">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.analysis.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.analysis.sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snap.endCondition ? (
            <Chip className="text-muted-foreground">
              {t.analysis.endCondition}: {L(snap.endCondition.note, lang)}
            </Chip>
          ) : null}
          <Link
            href={`/runs/${runId}/outcome`}
            className="rounded-control border px-3 py-1.5 text-sm hover:border-foreground/40"
          >
            {t.nav.outcome}
          </Link>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <Panel title={t.analysis.trajectory}>
            <TrajectoryChart />
          </Panel>
          <Panel title={t.analysis.matrix}>
            <ConsensusMatrix />
          </Panel>
          <Panel title={t.analysis.incentiveMatrix} sub={t.analysis.incentiveSub}>
            <IncentiveMatrix />
          </Panel>
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
