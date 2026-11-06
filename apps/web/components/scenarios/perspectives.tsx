"use client";

import { type LocalizedText, localize } from "@sv/contracts";
import Link from "next/link";
import { AskButton } from "@/components/agent/ask-sheet";
import { AgentTile } from "@/components/run/agent-tile";
import { Section } from "@/components/shell/page";
import { usePrefs } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PerspectiveRow, ProposalVote } from "@/lib/scenario-insights";
import { cn } from "@/lib/utils";
import { scenarioT } from "./messages";

type Lang = "de" | "en";

const signed = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)}`.replace("-", "−");
const x = (v: number) => `${((v + 2) / 4) * 100}%`;

/** Start as a ring, one dot per run at the final stance; the midline is 0. */
function DotStrip({
  start,
  finals,
  runIds,
  labels,
  t,
}: {
  start: number | null;
  finals: Array<number | null>;
  runIds: string[];
  labels: Record<string, string>;
  t: ReturnType<typeof scenarioT>;
}) {
  return (
    <div className="relative h-3.5 w-full min-w-28 rounded-sm bg-gray-alpha-100">
      <span className="absolute inset-y-0 left-1/2 w-px bg-gray-alpha-300" aria-hidden />
      {finals.map((v, i) => {
        const id = runIds[i];
        if (v === null || !id) return null;
        return (
          <span
            key={id}
            title={`${labels[id] ?? id}: ${t.perspectives.end} ${signed(v)}`}
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/70 ring-1 ring-card"
            style={{ left: x(v) }}
          />
        );
      })}
      {start !== null ? (
        <span
          title={`${t.perspectives.start} ${signed(start)}`}
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-card/60"
          style={{ left: x(start) }}
        />
      ) : null}
    </div>
  );
}

function VoteList({
  votes,
  labels,
  lang,
  t,
}: {
  votes: ProposalVote[];
  labels: Record<string, string>;
  lang: Lang;
  t: ReturnType<typeof scenarioT>;
}) {
  const status: Record<ProposalVote["status"], string> = {
    accepted: t.perspectives.accepted,
    rejected: t.perspectives.rejected,
    open: t.perspectives.openProposal,
    withdrawn: t.perspectives.withdrawn,
  };
  return (
    <ul className="mt-1.5 flex flex-col gap-1 text-xs">
      {votes.map((v) => (
        <li key={`${v.runId}-${v.proposalId}`} className="flex gap-1.5">
          <span
            className={cn(
              "shrink-0",
              v.status === "accepted" && "text-success",
              v.status === "rejected" && "text-destructive",
              v.status !== "accepted" && v.status !== "rejected" && "text-muted-foreground",
            )}
          >
            {status[v.status]}
          </span>
          <span className="min-w-0">{localize(v.title, lang)}</span>
          <span className="shrink-0 text-muted-foreground">{labels[v.runId] ?? v.runId}</span>
        </li>
      ))}
    </ul>
  );
}

export function Perspectives({
  rows,
  runIds,
  labels,
  redLineTexts,
  canAsk,
}: {
  rows: PerspectiveRow[];
  /** Column order of the final stances. */
  runIds: string[];
  labels: Record<string, string>;
  redLineTexts: Record<string, LocalizedText>;
  /** True when the component sits inside a RunProvider of the reference run. */
  canAsk: boolean;
}) {
  const { lang } = usePrefs();
  const t = scenarioT(lang);
  const p = t.perspectives;
  return (
    <Section variant="plain" aria-label={p.stances}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">{p.institution}</th>
              <th className="w-[42%] px-3 py-2 font-medium">
                {p.stances}
                <span className="ml-2 font-normal">{p.stancesHint}</span>
              </th>
              <th className="px-3 py-2 font-medium">{p.redLines}</th>
              <th className="px-3 py-2 font-medium">{p.votes}</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">{p.card}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agentId} className="border-t align-top" data-institution={r.agentId}>
                <td className="py-4 pr-3">
                  <AgentTile agentId={r.agentId} withName lang={lang} />
                  <div className="num mt-1.5 text-xs text-muted-foreground">
                    {p.moved} {r.moved.toFixed(1)}
                  </div>
                </td>
                <td className="px-3 py-4">
                  <div className="grid grid-cols-[minmax(0,11rem)_1fr] items-center gap-x-3 gap-y-1.5">
                    {r.topics.map((tp) => (
                      <div key={tp.topicId} className="contents">
                        <span className="truncate text-xs" title={localize(tp.label, lang)}>
                          {localize(tp.label, lang)}
                        </span>
                        <DotStrip
                          start={tp.start}
                          finals={tp.finals}
                          runIds={runIds}
                          labels={labels}
                          t={t}
                        />
                      </div>
                    ))}
                  </div>
                </td>
                <td className="max-w-80 px-3 py-4">
                  {r.redLines.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{p.noRedLines}</span>
                  ) : (
                    <ul className="flex flex-col gap-1.5 text-xs">
                      {r.redLines.map((rl) => {
                        const text = redLineTexts[rl.id];
                        return (
                          <li key={rl.id} className="flex gap-2">
                            <span
                              aria-hidden
                              className={cn(
                                "mt-1.5 size-1.5 shrink-0 rounded-full",
                                rl.touched > 0 ? "bg-warning" : "bg-gray-alpha-300",
                              )}
                            />
                            <span className="min-w-0">
                              <span className="block leading-snug">
                                {text ? localize(text, lang) : rl.id}
                              </span>
                              <span
                                className={cn(
                                  "num",
                                  rl.touched > 0 ? "text-warning" : "text-muted-foreground",
                                )}
                              >
                                {rl.touched > 0
                                  ? p.touched(rl.touched, rl.runsTouched)
                                  : p.untouched}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-4">
                  <details className="group text-xs">
                    <summary className="num cursor-pointer list-none whitespace-nowrap hover:text-foreground">
                      <span className="text-success">
                        {r.supported.length} {p.supported}
                      </span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-destructive">
                        {r.opposed.length} {p.opposed}
                      </span>
                    </summary>
                    {r.supported.length ? (
                      <VoteList votes={r.supported} labels={labels} lang={lang} t={t} />
                    ) : null}
                    {r.opposed.length ? (
                      <VoteList votes={r.opposed} labels={labels} lang={lang} t={t} />
                    ) : null}
                  </details>
                </td>
                <td className="px-3 py-4">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {canAsk ? <AskButton agentId={r.agentId} /> : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          {p.card}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {r.runIds.map((id) => (
                          <DropdownMenuItem key={id} asChild>
                            <Link href={`/runs/${id}/agents/${r.agentId}`}>{labels[id] ?? id}</Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
