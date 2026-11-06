"use client";

import type { RoundLesson, RoundSummary, ScheduledEvent } from "@sv/contracts";
import { Level } from "@/components/shell/providers";
import { Chip, Tile, UttRef } from "./bits";
import { L } from "./helpers";
import { SourceChip } from "./provenance";
import { useRun } from "./run-context";

function topicName(
  run: ReturnType<typeof useRun>["run"],
  topicId: string,
  lang: "de" | "en",
): string {
  const tp = run.mandate.topics.find((x) => x.id === topicId);
  return tp ? L(tp.label, lang) : topicId;
}

/** Moderator round summary, open conflicts first (FR-M6, FR-M7). */
export function RoundSummaryCard({
  summary,
  collapsedCount,
  onToggle,
  expanded,
}: {
  summary: RoundSummary;
  collapsedCount?: number;
  onToggle?: () => void;
  expanded?: boolean;
}) {
  const { t, lang, run, snap, evidence } = useRun();
  // Open conflicts come first (FR-M7); agreement, failed proposals and new options sit in
  // one closed details row so the card reads as text plus conflicts.
  const secondary = [
    { label: t.live.agreement, n: summary.consensus.length },
    { label: t.live.failedProposals, n: summary.failedProposals.length },
    { label: t.live.newOptions, n: summary.newOptions.length },
  ].filter((s) => s.n > 0);
  return (
    <section className="rounded-2xl border bg-gray-alpha-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t.live.summaryTitle(summary.round)}</h3>
        {onToggle && collapsedCount ? (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-control border bg-background px-2.5 py-1 text-xs hover:border-foreground/40"
          >
            {expanded ? t.live.collapseRound : t.live.expandRound(collapsedCount)}
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed">{L(summary.text, lang)}</p>
      <div className="mt-4 text-sm">
        <div className="text-xs text-muted-foreground">
          {t.live.openConflicts} ({summary.openConflicts.length})
        </div>
        <ul className="mt-1 space-y-2">
          {summary.openConflicts.map((c) => (
            <li key={c.topicId}>
              <span className="font-medium">{topicName(run, c.topicId, lang)}</span>
              <span className="text-muted-foreground">: {L(c.note, lang)}</span>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {c.sides[0].map((a) => (
                  <Tile key={a} id={a} />
                ))}
                {c.sides[0].length && c.sides[1].length ? (
                  <span className="px-1 text-xs text-muted-foreground">vs</span>
                ) : null}
                {c.sides[1].map((a) => (
                  <Tile key={a} id={a} />
                ))}
              </div>
              {c.boundBy.length ? (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {c.boundBy.map((rl) => (
                    <li key={rl} className="border-l-2 border-warning pl-2" title={rl}>
                      {L(evidence.redLines[rl]?.text, lang) || rl}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
          {summary.openConflicts.length === 0 ? (
            <li className="text-muted-foreground">{t.live.none}</li>
          ) : null}
        </ul>
      </div>
      {secondary.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {secondary.map((s) => `${s.label} ${s.n}`).join(" · ")}
          </summary>
          <div className="mt-2 grid gap-x-6 gap-y-3 md:grid-cols-2">
            {summary.consensus.length ? (
              <div>
                <div className="text-xs text-muted-foreground">{t.live.agreement}</div>
                <ul className="mt-1 space-y-1">
                  {summary.consensus.map((c) => (
                    <li key={c.topicId} className="flex justify-between gap-2">
                      <span>{L(c.note, lang)}</span>
                      <span className="num shrink-0 text-muted-foreground">
                        {c.share[0]}/{c.share[1]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {summary.failedProposals.length ? (
              <div>
                <div className="text-xs text-muted-foreground">{t.live.failedProposals}</div>
                <ul className="mt-1 space-y-1">
                  {summary.failedProposals.map((f) => {
                    const p = snap.proposals[f.proposalId];
                    return (
                      <li key={f.proposalId}>
                        <Level min="engineer">
                          <span className="font-mono text-xs">{f.proposalId} </span>
                        </Level>
                        {p ? L(p.title, lang) : f.proposalId}
                        <span className="text-muted-foreground"> · {L(f.reason, lang)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {summary.newOptions.length ? (
              <div>
                <div className="text-xs text-muted-foreground">{t.live.newOptions}</div>
                <ul className="mt-1 space-y-1">
                  {summary.newOptions.map((o) => (
                    <li key={o.text}>{L(o, lang)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** Lesson cards per round (W-53, FR-R8), with links to the utterances they changed. */
export function LessonCards({ round, lessons }: { round: number; lessons: RoundLesson[] }) {
  const { t, lang, snap } = useRun();
  const interesting = lessons.filter(
    (l) =>
      l.failed.length ||
      l.passed.length ||
      l.blockedBy.length ||
      snap.lessonApplications.some((a) => a.agentId === l.agentId && a.lessonRound === l.round),
  );
  const shown = interesting.length ? interesting : lessons.slice(0, 3);
  if (!shown.length) return null;
  // Closed by default: the lessons matter when the jury asks what an agent learned, not
  // while reading the round.
  return (
    <details className="group rounded-2xl border border-info/25 bg-info/5 px-4 py-3">
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 marker:content-none">
        <h3 className="font-semibold">
          <span className="mr-1.5 inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90">
            ▸
          </span>
          {t.live.lessonsTitle(round)} · {shown.length}
        </h3>
        <span className="text-xs text-muted-foreground">{t.live.lessonsSub}</span>
      </summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {shown.map((l) => {
          const applied = snap.lessonApplications.filter(
            (a) => a.agentId === l.agentId && a.lessonRound === l.round,
          );
          return (
            <div key={l.agentId} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-center gap-2">
                <Tile id={l.agentId} withName />
              </div>
              <p className="mt-1.5">{L(l.implication, lang)}</p>
              <p className="mt-1 text-muted-foreground">
                <span className="text-foreground">{t.live.nextMove}:</span> {L(l.nextMove, lang)}
              </p>
              {l.passed.length || l.failed.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {l.passed.map((p) => (
                    <Chip key={p} className="border-success/30 text-success font-mono">
                      ✓ {p}
                    </Chip>
                  ))}
                  {l.failed.map((p) => (
                    <Chip key={p} className="border-warning/40 text-warning font-mono">
                      ✗ {p}
                    </Chip>
                  ))}
                </div>
              ) : null}
              {l.blockedBy.length ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {t.live.blockedBy}
                  {l.blockedBy.map((b) => (
                    <span
                      key={`${b.agentId}-${b.proposalId}`}
                      className="inline-flex items-center gap-1"
                    >
                      <Tile id={b.agentId} />
                      <span className="font-mono">{b.proposalId}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {l.redLineExpectations.slice(0, 2).map((x) => (
                <div
                  key={`${x.agentId}-${x.redLineId}`}
                  className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"
                >
                  <span>{t.live.expects}</span>
                  <Tile id={x.agentId} />
                  <span>
                    {L(x.text, lang)} ({Math.round(x.confidence * 100)} %)
                  </span>
                </div>
              ))}
              {applied.map((a) => (
                <div key={a.utteranceId} className="mt-1.5 text-xs text-info">
                  {t.live.appliedIn} <UttRef id={a.utteranceId} />: {L(a.note, lang)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}

export function EventCard({ ev }: { ev: ScheduledEvent }) {
  const { t, lang } = useRun();
  return (
    <section className="rounded-2xl border-2 border-dashed border-info/40 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip className="border-info/40 bg-info/10 text-info">{t.live.eventInjected}</Chip>
        <span className="text-xs text-muted-foreground">{ev.kind}</span>
        <span className="font-medium">{L(ev.title, lang)}</span>
      </div>
      <p className="mt-1.5 text-sm">
        {L(ev.body, lang)}
        {ev.sourceRef ? <SourceChip cite={ev.sourceRef} /> : null}
      </p>
    </section>
  );
}

export function ExpertNote({
  note,
}: {
  note: ReturnType<typeof useRun>["snap"]["expertNotes"][number];
}) {
  const { t, lang } = useRun();
  return (
    <div className="ml-4 border-l-2 pl-3 text-sm text-muted-foreground">
      <Chip className="mr-2 border-warning/40 bg-warning/10 text-warning">{t.live.expert}</Chip>
      {L(note.note, lang)} ·{" "}
      {note.utteranceIds.map((id, i) => (
        <span key={id}>
          {i ? " ↔ " : ""}
          <UttRef id={id} />
        </span>
      ))}{" "}
      · <em>{note.resolution === "resolved" ? t.live.resolved : t.live.unresolved}</em>
    </div>
  );
}
