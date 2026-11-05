"use client";

import type { Claim, UtteranceTrace } from "@sv/contracts";
import Link from "next/link";
import { useState } from "react";
import { Chip, Empty, Panel, Tile, UttRef } from "@/components/run/bits";
import { agentLook, L } from "@/components/run/helpers";
import { ClaimRow, SourceChip } from "@/components/run/provenance";
import { useRun } from "@/components/run/run-context";
import { cn } from "@/lib/utils";

/** Deliberation inspector (W-12, W-13): record, prompt, retrieval, model, telemetry,
 * claims with verifying models, lessons used (FR-T1..T7, FR-R8). */
export function InspectorView({
  utteranceId,
  trace,
}: {
  utteranceId: string;
  trace: UtteranceTrace | null;
}) {
  const { snap, run, t, lang, runId, evidence } = useRun();
  const [copied, setCopied] = useState(false);
  const [openAll, setOpenAll] = useState(false);
  const u = snap.utterances[utteranceId];
  if (!u) {
    return (
      <main className="mx-auto max-w-[1600px] px-4 sm:px-6 pt-6">
        <Empty>{t.inspector.notFound}</Empty>
      </main>
    );
  }
  const idx = snap.utteranceOrder.indexOf(u.id);
  const prev = snap.utteranceOrder[idx - 1];
  const next = snap.utteranceOrder[idx + 1];
  const claims = u.claimIds.map((c) => snap.claims[c]).filter((c): c is Claim => !!c);
  const speaker = agentLook(run, u.speaker, lang);
  const reply = u.respondsTo ? snap.utterances[u.respondsTo] : null;
  const d = trace?.deliberation ?? null;
  const lessonKeys = d?.lessonsUsed ?? [];
  const lessons = lessonKeys
    .map((k) => {
      const [agentId, r] = k.split("@r");
      return snap.lessons.find((l) => l.agentId === agentId && l.round === Number(r)) ?? null;
    })
    .filter((l) => l !== null);
  const applied = snap.lessonApplications.filter((a) => a.utteranceId === u.id);
  const tel = u.telemetry;
  const totalTokens = trace?.prompt.reduce((a, b) => a + b.tokens, 0) ?? 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ utterance: u, claims, trace }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1800px] px-4 sm:px-6 pt-5 pb-12">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/runs/${runId}?u=${u.id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← {t.inspector.back}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {t.inspector.title}{" "}
            <span className="font-mono text-base text-muted-foreground">{u.id}</span>
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.inspector.sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-control border p-0.5 text-xs">
            {prev ? (
              <Link
                href={`/runs/${runId}/inspect/${prev}`}
                className="rounded-[8px] px-2 py-1 font-mono hover:bg-gray-alpha-100"
              >
                ← {prev}
              </Link>
            ) : null}
            <span className="rounded-[8px] bg-gray-alpha-150 px-2 py-1 font-mono">{u.id}</span>
            {next ? (
              <Link
                href={`/runs/${runId}/inspect/${next}`}
                className="rounded-[8px] px-2 py-1 font-mono hover:bg-gray-alpha-100"
              >
                {next} →
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            onClick={copy}
            className="rounded-control border px-3 py-1.5 text-sm hover:border-foreground/40"
          >
            {copied ? t.inspector.copied : t.inspector.copyJson}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-center gap-2">
              <Tile id={u.speaker} size="md" />
              <span className="text-base font-medium">{speaker.name}</span>
              <Chip>
                {t.common.round} {u.round} · {t.kind[u.kind]}
              </Chip>
              {u.redLinesTouched.length ? (
                <Chip className="border-warning/40 bg-warning/10 text-warning">
                  {t.live.redLineTouched}
                </Chip>
              ) : null}
              <span className="flex-1" />
              {reply ? (
                <span className="text-xs text-muted-foreground">
                  {t.live.respondsTo} <UttRef id={reply.id} />{" "}
                  {agentLook(run, reply.speaker, lang).name}
                </span>
              ) : null}
            </div>
            <blockquote className="mt-3 border-l-[3px] border-destructive/70 pl-3 text-sm leading-relaxed">
              {L(u.text, lang)}
            </blockquote>
            {applied.length ? (
              <div className="mt-3 rounded-xl border border-info/30 bg-info/5 p-2.5 text-sm">
                <span className="font-medium">{t.inspector.lessonApplied}:</span>{" "}
                {applied.map((a) => (
                  <span key={`${a.agentId}-${a.lessonRound}`}>
                    <span className="font-mono text-xs">
                      {a.agentId}@r{a.lessonRound}
                    </span>{" "}
                    {L(a.note, lang)}
                  </span>
                ))}
              </div>
            ) : null}
          </Panel>

          {!trace ? <Empty>{t.inspector.noTrace}</Empty> : null}

          {d ? (
            <Panel title={t.inspector.record} aside={<Chip>schema v{d.schemaVersion}</Chip>}>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-1.5 text-xs text-muted-foreground">
                    {t.inspector.sourcesRead}
                  </h3>
                  <ul className="space-y-1">
                    {d.sourcesRead.map((s) => (
                      <li
                        key={s.ref.segmentId}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <SourceChip cite={s.ref} />
                        <Chip
                          className={cn(
                            s.use === "cited" && "border-success/30 bg-success/10 text-success",
                            s.use === "read_adverse" && "border-warning/40 text-warning",
                          )}
                        >
                          {t.inspector.use[s.use]}
                        </Chip>
                      </li>
                    ))}
                    {d.priorUtterances.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          <UttRef id={p.id} />{" "}
                          {snap.utterances[p.id]
                            ? agentLook(run, snap.utterances[p.id]?.speaker ?? "", lang).name
                            : ""}
                        </span>
                        <Chip>{t.inspector.relation[p.relation]}</Chip>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1.5 text-xs text-muted-foreground">{t.inspector.decision}</h3>
                  <p className="text-sm">{L(d.decision, lang)}</p>
                  <h3 className="mt-3 mb-1.5 text-xs text-muted-foreground">
                    {t.inspector.wouldChange}
                  </h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {d.wouldChangeMind.map((w) => (
                      <li key={w.text}>{L(w, lang)}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <h3 className="mt-4 mb-1.5 text-xs text-muted-foreground">{t.inspector.options}</h3>
              <div className="space-y-2">
                {d.options.map((o) => (
                  <div
                    key={o.key}
                    className={cn(
                      "rounded-xl border p-3",
                      o.status === "chosen" && "border-foreground ring-1 ring-foreground",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-grid size-5 place-items-center rounded-md border font-mono text-[11px]">
                        {o.key}
                      </span>
                      <span className="text-sm font-medium">{L(o.label, lang)}</span>
                      <Chip
                        className={
                          o.status === "chosen"
                            ? "h-auto border-success/30 bg-success/10 py-0.5 whitespace-normal text-success"
                            : "h-auto py-0.5 whitespace-normal text-muted-foreground"
                        }
                      >
                        {o.status === "chosen" ? t.inspector.chosen : t.inspector.rejected}
                        {o.rejectReason ? ` · ${L(o.rejectReason, lang)}` : ""}
                      </Chip>
                    </div>
                    <div className="mt-2 grid gap-3 pl-7 text-xs md:grid-cols-2">
                      <div>
                        <div className="text-muted-foreground">{t.inspector.pros}</div>
                        {o.pros.map((p) => (
                          <div key={p.text}>{L(p, lang)}</div>
                        ))}
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t.inspector.cons}</div>
                        {o.cons.map((p) => (
                          <div key={p.text}>{L(p, lang)}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-xl border bg-gray-alpha-50 p-2.5 text-xs">
                <span className="font-medium">{t.inspector.providerTrace}:</span>{" "}
                {d.providerTrace.available ? d.providerTrace.text : (d.providerTrace.note ?? "-")}
              </p>
            </Panel>
          ) : null}

          {trace ? (
            <Panel
              title={t.inspector.prompt}
              aside={
                <>
                  <span className="text-xs text-muted-foreground">
                    {totalTokens} {t.inspector.tokens} · {trace.prompt.length} {t.inspector.blocks}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenAll((o) => !o)}
                    className="rounded-control border px-2 py-0.5 text-xs"
                  >
                    {openAll ? "−" : "+"}
                  </button>
                </>
              }
            >
              <div className="space-y-2">
                {trace.prompt.map((b, i) => (
                  <details
                    // biome-ignore lint/suspicious/noArrayIndexKey: prompt blocks are ordered
                    key={i}
                    open={openAll || i < 2}
                    className="rounded-xl border"
                  >
                    <summary className="flex cursor-pointer justify-between px-3 py-2 text-xs">
                      <span>
                        <span className="font-mono">{b.role}</span> · {b.title}
                      </span>
                      <span className="num text-muted-foreground">{b.tokens} tok</span>
                    </summary>
                    <pre className="overflow-x-auto border-t px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
                      {b.text}
                    </pre>
                  </details>
                ))}
              </div>
            </Panel>
          ) : null}

          {trace?.retrieval.map((r) => (
            <Panel
              key={r.query}
              title={t.inspector.retrieval}
              aside={
                <>
                  <Chip>as-of {r.asOf}</Chip>
                  <Chip className="font-mono">{r.corpusRevision}</Chip>
                </>
              }
            >
              <p className="mb-2 text-sm">
                <span className="text-muted-foreground">{t.inspector.query}: </span>
                <span className="font-mono text-xs">{r.query}</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1.5 font-normal">{t.inspector.passage}</th>
                      <th className="px-2 text-right font-normal">{t.inspector.bm25}</th>
                      <th className="px-2 text-right font-normal">{t.inspector.vector}</th>
                      <th className="px-2 text-right font-normal">{t.inspector.fused}</th>
                      <th className="px-2 text-right font-normal">w</th>
                      <th className="px-2 font-normal">{t.inspector.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.candidates.map((c) => {
                      const seg = evidence.segments[c.segmentId];
                      const src = seg ? evidence.sources[seg.sourceId] : undefined;
                      return (
                        <tr key={c.segmentId} className="border-b align-top last:border-0">
                          <td className="max-w-[460px] py-1.5 pr-2">
                            <div className="font-mono text-xs">
                              {c.segmentId}
                              {src ? ` · ${src.institution.code} · ${src.date}` : ""}
                            </div>
                            {seg ? (
                              <div className="text-xs text-muted-foreground">„{seg.text}“</div>
                            ) : null}
                          </td>
                          <td className="num px-2 text-right">{c.bm25Rank ?? "·"}</td>
                          <td className="num px-2 text-right">{c.vectorRank ?? "·"}</td>
                          <td className="num px-2 text-right">{c.fused.toFixed(3)}</td>
                          <td className="num px-2 text-right">{c.recencyWeight.toFixed(2)}</td>
                          <td className="px-2 py-1.5">
                            <Chip
                              className={
                                c.used
                                  ? "border-success/30 bg-success/10 text-success"
                                  : "text-muted-foreground"
                              }
                            >
                              {c.used ? t.inspector.used : t.inspector.discarded}
                            </Chip>
                            {c.discardReason ? (
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {c.discardReason}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title={t.inspector.modelParams}>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t.live.model}</dt>
              <dd className="font-mono text-xs">{u.model}</dd>
              <dt className="text-muted-foreground">temperature</dt>
              <dd className="num">{tel?.params.temperature ?? "-"}</dd>
              <dt className="text-muted-foreground">max tokens</dt>
              <dd className="num">{tel?.params.maxOutputTokens ?? "-"}</dd>
              <dt className="text-muted-foreground">seed</dt>
              <dd className="num">{tel?.params.seed ?? "-"}</dd>
              <dt className="text-muted-foreground">{t.inspector.requestId}</dt>
              <dd className="font-mono text-xs">{tel?.gatewayRequestId ?? "-"}</dd>
            </dl>
          </Panel>
          <Panel title={t.inspector.telemetry}>
            {tel ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    [t.inspector.latency, `${(tel.latencyMs / 1000).toFixed(2)} s`],
                    [t.inspector.cost, tel.costEur != null ? `${tel.costEur.toFixed(4)} €` : "-"],
                    [t.inspector.tokensIn, String(tel.tokensIn)],
                    [t.inspector.tokensOut, String(tel.tokensOut)],
                    [t.inspector.retries, String(tel.retries)],
                    [t.inspector.cache, tel.cacheHit ? t.inspector.yes : t.inspector.no],
                    [t.inspector.fallback, tel.fallbackFrom ?? "-"],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dd className="num font-medium">{v}</dd>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </Panel>
          <Panel title={t.inspector.claims}>
            <div className="space-y-2">
              {claims.map((c) => (
                <ClaimRow key={c.id} claim={c} />
              ))}
              {claims.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.live.noClaims}</p>
              ) : null}
              {claims[0]?.decompositionModel ? (
                <p className="text-xs text-muted-foreground">
                  {t.claim.decomposition}{" "}
                  <span className="font-mono">{claims[0].decompositionModel}</span>
                </p>
              ) : null}
            </div>
          </Panel>
          <Panel title={t.inspector.lessonsUsed}>
            {lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {lessonKeys.length ? lessonKeys.join(", ") : t.inspector.noLessons}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lessons.map((l) => (
                  <li key={`${l.agentId}-${l.round}`} className="rounded-xl border p-2.5">
                    <div className="flex items-center gap-2">
                      <Tile id={l.agentId} />
                      <span className="font-mono text-xs">
                        {l.agentId}@r{l.round}
                      </span>
                    </div>
                    <p className="mt-1">{L(l.implication, lang)}</p>
                    <p className="text-muted-foreground">
                      {t.live.nextMove}: {L(l.nextMove, lang)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}
