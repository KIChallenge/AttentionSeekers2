"use client";

import { positionAt, topicStatus } from "@sv/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { statusLabel } from "@/components/analysis/consensus-matrix";
import { Chip, Tile, UttRef } from "@/components/run/bits";
import { agentLook, fmtStance, L } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid border-t py-5 first:border-t-0">
      <h2 className="mb-2 text-lg font-semibold">
        <span className="num mr-2 text-muted-foreground">{n}.</span>
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

/** Eight-part result document (FR-O1..O3), derived from the snapshot, never generated. */
export function ResultDocument() {
  const { snap, run, t, lang, runId, evidence } = useRun();
  const m = run.mandate;
  const topics = m.topics;
  const status = topics.map((tp) => ({ tp, st: topicStatus(snap, tp.id) }));
  const proposals = snap.proposalOrder.map((id) => snap.proposals[id]).filter((p) => !!p);
  const accepted = proposals.filter((p) => p?.status === "accepted");
  const lastSummary = snap.summaries.at(-1);
  const open = lastSummary?.openConflicts ?? [];
  const topicName = (id: string) => {
    const tp = topics.find((x) => x.id === id);
    return tp ? L(tp.label, lang) : id;
  };
  const figs = snap.figures;

  return (
    <main className="mx-auto max-w-[920px] px-4 sm:px-6 pt-6 pb-16 print:max-w-none print:pt-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.result.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.result.sub} <span className="font-mono">{run.id}</span> ·{" "}
            {run.createdAt.slice(0, 10)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-control border px-3 py-1.5 text-sm hover:border-foreground/40 print:hidden"
        >
          {t.result.print}
        </button>
      </div>
      <article className="rounded-2xl border bg-card px-4 sm:px-6 print:border-0 print:px-0">
        <Section n={1} title={t.result.s1}>
          <p className="text-base font-medium">{m.question}</p>
          <p>
            <span className="text-muted-foreground">{t.result.objective}: </span>
            {L(m.objective, lang)}
          </p>
          <ul className="list-disc pl-5">
            {m.constraints.map((c) => (
              <li key={c.text}>{L(c, lang)}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {t.analysis.rule_[run.room.decisionRule]} · {run.room.roundLimit} {t.common.round} ·
            as-of {m.asOf}
          </p>
        </Section>

        <Section n={2} title={t.result.s2}>
          <table className="w-full text-sm">
            <tbody>
              {m.actors.map((a) => {
                const look = agentLook(run, a.agentId, lang);
                return (
                  <tr key={a.agentId} className="border-b align-top last:border-0">
                    <td className="py-1.5 pr-3 sm:whitespace-nowrap">
                      <Link
                        href={`/runs/${runId}/agents/${a.agentId}`}
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        <Tile id={a.agentId} /> {look.name}
                      </Link>
                    </td>
                    <td className="py-1.5 text-muted-foreground">{L(a.reason, lang)}</td>
                    <td className="hidden py-1.5 pl-2 font-mono text-[11px] text-muted-foreground sm:table-cell">
                      {run.modelAssignment[a.agentId] ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section n={3} title={t.result.s3}>
          {snap.summaries.map((s) => (
            <p key={s.round}>
              <span className="font-medium">{t.result.roundLine(s.round)}: </span>
              {L(s.text, lang)}
            </p>
          ))}
          <p>
            <Link href={`/runs/${runId}?view=full`} className="underline">
              {t.result.fullDebate} →
            </Link>
          </p>
        </Section>

        <Section n={4} title={t.result.s4}>
          <ul className="space-y-2">
            {open.map((c) => (
              <li key={c.topicId}>
                <span className="font-medium">{topicName(c.topicId)}</span>: {L(c.note, lang)}
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {c.sides[0].map((a) => (
                    <Tile key={a} id={a} />
                  ))}
                  <span className="px-1 text-xs text-muted-foreground">vs</span>
                  {c.sides[1].map((a) => (
                    <Tile key={a} id={a} />
                  ))}
                  {c.boundBy.map((id) => (
                    <Chip
                      key={id}
                      className="h-auto border-destructive/30 py-0.5 whitespace-normal text-destructive"
                    >
                      {evidence.redLines[id] ? L(evidence.redLines[id].text, lang) : id}
                    </Chip>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section n={5} title={t.result.s5}>
          <ul className="space-y-1.5">
            {proposals.map((p) =>
              p ? (
                <li key={p.id}>
                  <span className="font-mono text-xs text-muted-foreground">{p.id}</span>{" "}
                  <Tile id={p.originAgent} /> {L(p.title, lang)} ·{" "}
                  <span className="text-muted-foreground">{t.analysis.pStatus[p.status]}</span>
                  {p.rejectionReason ? (
                    <span className="text-muted-foreground"> · {L(p.rejectionReason, lang)}</span>
                  ) : null}
                </li>
              ) : null,
            )}
          </ul>
        </Section>

        <Section n={6} title={t.result.s6}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(
              [
                ["consensus", t.result.consensus],
                ["majority", t.result.majority],
                ["minority", t.result.minority],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <ul className="mt-1 space-y-1">
                  {status
                    .filter((x) => x.st.status === k)
                    .map(({ tp, st }) => (
                      <li key={tp.id}>
                        {L(tp.label, lang)}{" "}
                        <span className="num text-muted-foreground">
                          {st.support}/{st.of}
                        </span>
                        {k === "minority" ? (
                          <div className="flex flex-wrap gap-0.5">
                            {run.agents
                              .filter((a) => (positionAt(snap, a.id, tp.id)?.stance ?? 0) >= 0.5)
                              .map((a) => (
                                <Tile key={a.id} id={a.id} />
                              ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  {status.filter((x) => x.st.status === k).length === 0 ? (
                    <li className="text-muted-foreground">·</li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t.analysis.rule}</p>
        </Section>

        <Section n={7} title={t.result.s7}>
          <ul className="space-y-1.5">
            {status
              .filter((x) => x.st.status === "no_result" || open.some((c) => c.topicId === x.tp.id))
              .map(({ tp, st }) => {
                const c = open.find((x) => x.topicId === tp.id);
                return (
                  <li key={tp.id}>
                    <span className="font-medium">{L(tp.label, lang)}</span>{" "}
                    <Chip className="text-muted-foreground">{statusLabel(st.status, lang)}</Chip>
                    {c ? <span className="text-muted-foreground"> {L(c.note, lang)}</span> : null}
                    {c ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {c.sides[1]
                          .map(
                            (a) =>
                              `${agentLook(run, a, lang).code} ${fmtStance(positionAt(snap, a, tp.id)?.stance ?? 0)}`,
                          )
                          .join(", ")}
                      </span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
          <p className="text-xs text-muted-foreground">{t.analysis.neverForced}</p>
        </Section>

        <Section n={8} title={t.result.s8}>
          {figs.length ? (
            <ul className="space-y-1">
              {figs.map((f) => (
                <li key={`${f.measureId}-${f.metric}`}>
                  <span className="font-mono text-xs text-muted-foreground">{f.measureId}</span>{" "}
                  {t.outcome.metric[f.metric]}:{" "}
                  <span className="num font-medium">
                    {f.value ?? t.outcome.notModelled} {f.value !== null ? f.unit : ""}
                  </span>
                  {f.low !== null && f.high !== null ? (
                    <span className="num text-muted-foreground">
                      {" "}
                      ({f.low} {lang === "de" ? "bis" : "to"} {f.high})
                    </span>
                  ) : null}
                  {f.inputs.some((i) => i.assumption) ? (
                    <Chip className="ml-1 border-dashed">{t.outcome.assumption}</Chip>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t.outcome.noFigures}</p>
          )}
          {snap.forecasts.map((f) => (
            <p key={f.measureId}>
              <span className="font-mono text-xs text-muted-foreground">{f.measureId}</span>{" "}
              {f.status === "ok" && f.k !== null
                ? `${t.outcome.sentence(f.k, f.n)}${f.interval ? ` (${Math.round(f.interval.low * 100)} ${lang === "de" ? "bis" : "to"} ${Math.round(f.interval.high * 100)} %)` : ""}.`
                : f.status === "small_n"
                  ? t.outcome.smallN(f.n)
                  : t.outcome.unavailable}
            </p>
          ))}
          <h3 className="pt-2 font-semibold">{t.result.recommendations}</h3>
          <ol className="list-decimal space-y-1 pl-5">
            {accepted.map((p) =>
              p ? <li key={p.id}>{t.result.recPackage(L(p.title, lang))}</li> : null,
            )}
            {open.map((c) => (
              <li key={c.topicId}>
                {t.result.recOpen(`${topicName(c.topicId)} (${L(c.note, lang)})`)}
              </li>
            ))}
            <li>{t.result.recEvidence}</li>
          </ol>
          {snap.endCondition ? (
            <p className="pt-2 text-xs text-muted-foreground">
              {t.result.endCondition}: {L(snap.endCondition.note, lang)}
            </p>
          ) : null}
          {snap.expertNotes.length ? (
            <p className="text-xs text-muted-foreground">
              {t.live.expert}: {snap.expertNotes.map((n) => L(n.note, lang)).join("; ")} (
              {snap.expertNotes
                .flatMap((n) => n.utteranceIds)
                .map((id) => (
                  <UttRef key={id} id={id} className="mr-1" />
                ))}
              )
            </p>
          ) : null}
        </Section>
      </article>
    </main>
  );
}
