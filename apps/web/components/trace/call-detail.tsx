"use client";

import {
  type Claim,
  type LlmCall,
  modelFamily,
  type PromptBlock,
  type UtteranceTrace,
} from "@sv/contracts";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { Chip, Tile, UttRef } from "@/components/run/bits";
import { agentLook, claimStateClass, L, withKeys } from "@/components/run/helpers";
import { SourceChip } from "@/components/run/provenance";
import { useRun } from "@/components/run/run-context";
import { cn } from "@/lib/utils";
import { fmtClock, fmtInt, fmtMs, fmtUsd } from "./format";
import { familyColor, hasTiming } from "./model";
import type { TraceStrings } from "./strings";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t pt-3">
      <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Blocks({ blocks, t }: { blocks: PromptBlock[]; t: TraceStrings }) {
  return (
    <div className="space-y-1.5">
      {withKeys(blocks, (b) => `${b.role}:${b.title}`).map(([key, b]) => (
        <details key={key} className="group rounded-lg border bg-background">
          <summary className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs">
            <Chip className="font-mono text-[10px]">{b.role}</Chip>
            <span className="min-w-0 flex-1 truncate">{b.title}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              ~{b.tokens} {t.detail.tokensUnit}
            </span>
          </summary>
          <pre className="max-h-72 overflow-auto border-t px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {b.text}
          </pre>
        </details>
      ))}
    </div>
  );
}

function Kv({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 truncate text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Detail panel: telemetry, step split, inputs, output, reasoning summary, retrieval. */
export function CallDetail({
  call,
  siblings,
  t,
  onClose,
  loadTrace,
}: {
  call: LlmCall;
  /** All calls of the same turn, for the time split. */
  siblings: LlmCall[];
  t: TraceStrings;
  onClose: () => void;
  loadTrace: (runId: string, utteranceId: string) => Promise<UtteranceTrace | null>;
}) {
  const { run, runId, snap, lang } = useRun();
  const d = t.detail;
  const isUtt = call.parent.kind === "utterance" && call.parent.ref;
  const u = isUtt && call.parent.ref ? snap.utterances[call.parent.ref] : undefined;
  const [trace, setTrace] = useState<{ id: string; trace: UtteranceTrace | null } | null>(null);
  const ref = call.parent.ref;
  useEffect(() => {
    if (call.parent.kind !== "utterance" || !ref) return;
    let live = true;
    loadTrace(runId, ref)
      .then((tr) => live && setTrace({ id: ref, trace: tr }))
      .catch(() => live && setTrace({ id: ref, trace: null }));
    return () => {
      live = false;
    };
  }, [call.parent.kind, ref, runId, loadTrace]);
  const tr = trace && trace.id === ref ? trace.trace : undefined;
  const who = call.speaker ?? (call.parent.kind === "verification" ? "expert" : "moderator");
  const unknownTokens = call.unknown?.includes("tokens");
  const nr = d.notRecorded;
  const total = siblings.reduce((a, c) => a + c.durationMs, 0);

  const claims: Claim[] =
    call.parent.kind === "expert_check" || call.parent.kind === "verification"
      ? (ref ?? "")
          .split(",")
          .map((id) => snap.claims[id])
          .filter((c): c is Claim => Boolean(c))
      : [];
  const exchange =
    call.parent.kind === "exchange_outcome" ? snap.exchanges.find((x) => x.id === ref) : null;
  const summary =
    call.parent.kind === "summary" ? snap.summaries.find((s) => `r${s.round}` === ref) : null;
  const lesson =
    call.parent.kind === "lesson"
      ? snap.lessons.find((l) => `${l.agentId}@r${l.round}` === ref)
      : null;
  const assessment =
    call.parent.kind === "assessment" && call.agentId
      ? snap.assessments[call.agentId]?.find((a) => `${a.agentId}@r${a.round}` === ref)
      : null;

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex items-start gap-2">
        <Tile id={who} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {t.kind[call.parent.kind]}
            {ref && ref.length < 40 ? (
              <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                {ref}
              </span>
            ) : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {agentLook(run, who, lang).name}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-6 rounded-control border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {d.close}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip>
          <span
            className="size-2 rounded-[2px]"
            style={{ background: familyColor(modelFamily(call.model)) }}
          />
          {call.model}
          {call.unknown?.includes("model") ? ` (${d.assigned})` : ""}
        </Chip>
        <Chip
          className={cn(
            call.status === "failed" && "border-destructive/50 text-destructive",
            call.status === "fallback" && "border-warning/50 text-warning",
          )}
        >
          {t.status[call.status]}
        </Chip>
        <Chip className={cn(call.origin === "derived" && "border-dashed")}>
          {call.origin === "derived" ? t.derived : t.recorded}
        </Chip>
        <Chip className="font-mono">{call.callId}</Chip>
      </div>
      {call.origin === "derived" ? (
        <p className="text-[11px] text-muted-foreground">
          {hasTiming(call) ? d.derivedNote : t.unknownTiming}
        </p>
      ) : null}

      <Section title={d.telemetry}>
        <Kv
          rows={[
            [d.provider, call.provider],
            [
              d.schema,
              <span key="schema" className="font-mono">
                {call.schemaName}
              </span>,
            ],
            [d.start, hasTiming(call) ? fmtClock(call.startedAtMs) : nr],
            [d.duration, hasTiming(call) ? fmtMs(call.durationMs, lang) : nr],
            [d.tokensIn, unknownTokens ? nr : fmtInt(call.tokensIn, lang)],
            [d.cached, unknownTokens ? nr : fmtInt(call.tokensCached, lang)],
            [d.tokensOut, unknownTokens ? nr : fmtInt(call.tokensOut, lang)],
            [d.reasoning, unknownTokens ? nr : fmtInt(call.tokensReasoning, lang)],
            [d.cost, call.costUsd === null ? nr : fmtUsd(call.costUsd, lang)],
            [d.attempts, String(call.attempts)],
            [d.fallbackFrom, call.fallbackFrom ?? "-"],
            [
              d.requestId,
              <span key="rid" className="font-mono">
                {call.gatewayRequestId ?? "-"}
              </span>,
            ],
          ]}
        />
        {call.error ? (
          <p className="mt-2 rounded-lg border border-destructive/40 p-2 font-mono text-[11px] text-destructive">
            {d.error}: {call.error}
          </p>
        ) : null}
      </Section>

      {siblings.length > 1 && total > 0 ? (
        <Section title={d.share}>
          <div className="flex h-3 overflow-hidden rounded-full bg-gray-alpha-100">
            {siblings.map((c) => (
              <span
                key={c.callId}
                className={cn(
                  "border-r border-card last:border-r-0",
                  c.callId === call.callId && "ring-2 ring-foreground ring-inset",
                )}
                style={{
                  width: `${(c.durationMs / total) * 100}%`,
                  background: familyColor(modelFamily(c.model)),
                }}
                title={`${c.schemaName} ${fmtMs(c.durationMs, lang)}`}
              />
            ))}
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {siblings.map((c) => (
              <li key={c.callId} className="flex justify-between gap-2">
                <span
                  className={cn("truncate font-mono", c.callId === call.callId && "font-semibold")}
                >
                  {c.schemaName} · {t.status[c.status]}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {fmtMs(c.durationMs, lang)} · {Math.round((c.durationMs / total) * 100)} %
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {isUtt ? (
        <>
          <Section title={d.inputs}>
            {tr === undefined ? (
              <p className="text-xs text-muted-foreground">{d.loading}</p>
            ) : tr ? (
              <Blocks blocks={tr.prompt} t={t} />
            ) : (
              <p className="text-xs text-muted-foreground">{d.noTrace}</p>
            )}
          </Section>
          {u ? (
            <Section title={d.output}>
              <p className="text-sm leading-relaxed">{L(u.text, lang)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <UttRef id={u.id} />
                <Link
                  href={`/runs/${runId}/inspect/${u.id}`}
                  className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {d.openInspector} →
                </Link>
              </div>
            </Section>
          ) : null}
          {u?.deliberationSummary || tr?.deliberation ? (
            <Section title={d.reasoningSummary}>
              <Kv
                rows={[
                  ...(u?.deliberationSummary
                    ? ([
                        [d.read, u.deliberationSummary.read],
                        [d.weighed, u.deliberationSummary.weighed],
                        [d.wouldMove, u.deliberationSummary.wouldMoveIt],
                      ] as Array<[string, ReactNode]>)
                    : []),
                  ...(tr
                    ? ([[d.decision, L(tr.deliberation.decision, lang)]] as Array<
                        [string, ReactNode]
                      >)
                    : []),
                ]}
              />
              {tr ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {d.providerTrace}:{" "}
                  {tr.deliberation.providerTrace.available
                    ? tr.deliberation.providerTrace.text
                    : (tr.deliberation.providerTrace.note ?? "-")}
                </p>
              ) : null}
            </Section>
          ) : null}
          {tr?.retrieval.length ? (
            <Section title={d.retrieval}>
              {tr.retrieval.map((r) => (
                <div key={r.query.slice(0, 40)} className="space-y-1">
                  <p
                    className="line-clamp-2 font-mono text-[10.5px] text-muted-foreground"
                    title={r.query}
                  >
                    {r.query}
                  </p>
                  <ul className="space-y-1">
                    {[...r.candidates]
                      .sort((a, b) => Number(b.used) - Number(a.used) || b.fused - a.fused)
                      .slice(0, 12)
                      .map((c) => (
                        <li key={c.segmentId} className="flex items-center gap-1.5 text-[11px]">
                          <SourceChip
                            compact
                            cite={{
                              sourceId: c.segmentId.split("#")[0] ?? c.segmentId,
                              segmentId: c.segmentId,
                              start: null,
                              end: null,
                              recencyWeight: c.recencyWeight,
                            }}
                          />
                          <span
                            className={cn(
                              "shrink-0",
                              c.used ? "text-success" : "text-muted-foreground",
                            )}
                          >
                            {c.used ? d.used : (c.discardReason ?? d.discarded)}
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-muted-foreground tabular-nums">
                            bm25 {c.bm25Rank ?? "-"} · vec {c.vectorRank ?? "-"} · w{" "}
                            {c.recencyWeight.toFixed(2)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </Section>
          ) : null}
        </>
      ) : (
        <>
          {call.inputPreview?.length ? (
            <Section title={d.inputPreview}>
              <Blocks blocks={call.inputPreview} t={t} />
            </Section>
          ) : null}
          <Section title={d.output}>
            {exchange?.outcome ? <p className="text-sm">{L(exchange.outcome, lang)}</p> : null}
            {summary ? <p className="text-sm">{L(summary.text, lang)}</p> : null}
            {lesson ? (
              <p className="text-sm">
                {L(lesson.implication, lang)} {L(lesson.nextMove, lang)}
              </p>
            ) : null}
            {assessment ? (
              <p className="text-sm">{L(assessment.cooperationVsBlockade.reason, lang)}</p>
            ) : null}
            {claims.length ? (
              <ul className="space-y-1">
                {claims.map((c) => {
                  const v = c.verifyingModels.find((m) => m.model === call.model);
                  return (
                    <li key={c.id} className="flex items-start gap-1.5 text-xs">
                      <Chip className={cn("shrink-0", claimStateClass[c.state])}>{c.state}</Chip>
                      <span className="min-w-0 flex-1">
                        {c.atomicText}
                        {v ? (
                          <span className="block text-muted-foreground">
                            {v.verdict}: {v.reason}
                          </span>
                        ) : null}
                      </span>
                      <UttRef id={c.utteranceId} className="shrink-0" />
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {call.outputPreview ? (
              <details className="mt-2 rounded-lg border bg-background">
                <summary className="cursor-pointer px-2.5 py-1.5 text-xs">
                  {d.outputPreview}
                </summary>
                <pre className="max-h-72 overflow-auto border-t px-2.5 py-2 font-mono text-[11px] whitespace-pre-wrap">
                  {call.outputPreview}
                </pre>
              </details>
            ) : null}
            {(call.parent.kind === "assessment" || call.parent.kind === "lesson") &&
            call.agentId ? (
              <Link
                href={`/runs/${runId}/agents/${call.agentId}`}
                className="mt-2 inline-block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {d.openAgent} →
              </Link>
            ) : null}
          </Section>
        </>
      )}
    </div>
  );
}
