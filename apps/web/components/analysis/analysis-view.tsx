"use client";

import Link from "next/link";
import { Chip, Panel } from "@/components/run/bits";
import { L } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { Page, PageHead } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CoalitionGraph, IncentiveMatrix } from "./coalitions";
import { ConsensusMatrix } from "./consensus-matrix";
import { OpenConflicts, ProposalList, WhoMoved } from "./movement";
import { TrajectoryChart } from "./trajectory-chart";

export function AnalysisView() {
  const { snap, t, lang, runId } = useRun();
  const last = Math.max(1, snap.summaries.length);
  const openCount = snap.summaries.at(-1)?.openConflicts.length ?? 0;
  return (
    <Page width="full">
      {/* The end condition is the one sentence that frames every chart below. */}
      <PageHead
        title={t.analysis.title}
        sub={
          snap.endCondition
            ? `${t.analysis.endCondition}: ${L(snap.endCondition.note, lang)}`
            : t.analysis.sub
        }
        actions={
          <>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={openCount === 0}>
                  {t.analysis.conflicts}
                  <Chip className="border-warning/40 text-warning">{openCount}</Chip>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{t.analysis.conflicts}</DialogTitle>
                </DialogHeader>
                <OpenConflicts />
              </DialogContent>
            </Dialog>
            <Button asChild variant="outline">
              <Link href={`/runs/${runId}/outcome`}>{t.nav.outcome}</Link>
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Panel title={t.analysis.trajectory}>
            <TrajectoryChart />
          </Panel>
          <Panel title={t.analysis.matrix}>
            <ConsensusMatrix />
          </Panel>
          <details className="group rounded-2xl border bg-card p-5 shadow-none sm:p-6">
            <summary className="cursor-pointer marker:content-none">
              <span className="mr-1.5 inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90">
                ▸
              </span>
              <span className="text-base font-semibold">{t.analysis.incentiveMatrix}</span>
              <span className="ml-2 text-xs text-muted-foreground">{t.analysis.incentiveSub}</span>
            </summary>
            <div className="mt-5">
              <IncentiveMatrix />
            </div>
          </details>
          <Panel title={t.analysis.proposals} sub={t.analysis.proposalsSub}>
            <ProposalList />
          </Panel>
        </div>
        <div className="min-w-0 space-y-6">
          <Panel title={t.analysis.whoMoved} sub={t.analysis.whoMovedSub(last)}>
            <WhoMoved />
          </Panel>
          <Panel
            title={t.analysis.coalitionGraph}
            sub={t.analysis.coalitionSub(snap.calculi.at(-1)?.round ?? last)}
          >
            <CoalitionGraph />
          </Panel>
        </div>
      </div>
    </Page>
  );
}
