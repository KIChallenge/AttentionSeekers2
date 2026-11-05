"use client";

import { type Claim, PHASES, topicStatus, type Utterance } from "@sv/contracts";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Level, usePrefs } from "@/components/shell/providers";
import { cn } from "@/lib/utils";
import { Chip, EntityRef, Meter, Seg, Tile } from "./bits";
import { agentLook, L } from "./helpers";
import { ClaimRow, SourceChip } from "./provenance";
import { EventCard, ExpertNote, LessonCards, RoundSummaryCard } from "./round-blocks";
import { useRun } from "./run-context";
import { PendingCard, UtteranceCard } from "./utterance-card";

type View = "condensed" | "full";

function Roster({ round }: { round: number }) {
  const { snap, run, t, lang, runId } = useRun();
  const rs = snap.rounds.find((r) => r.round === round);
  const order = rs?.speakingOrder ?? run.agents.map((a) => a.id);
  const calc = [...snap.calculi].reverse().find((c) => c.round <= round) ?? null;
  const row = (id: string, sub: string, href?: string) => {
    const a = agentLook(run, id, lang);
    const active = snap.activeSpeaker === id;
    const inner = (
      <>
        <Tile id={id} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{a.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{sub}</span>
          <Level min="engineer">
            <span className="block truncate font-mono text-[10px] text-muted-foreground">
              {run.modelAssignment[id] ?? ""}
            </span>
          </Level>
        </span>
        {active ? (
          <span className="flex h-3 items-end gap-[2px]" title="speaking">
            {[0.5, 1, 0.7].map((h) => (
              <i
                key={h}
                className="block w-[3px] animate-pulse bg-foreground"
                style={{ height: `${h * 12}px` }}
              />
            ))}
          </span>
        ) : null}
      </>
    );
    const cls = cn(
      "relative flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-alpha-100",
      active &&
        "bg-gray-alpha-100 before:absolute before:inset-y-1 before:-left-2 before:w-[3px] before:rounded before:bg-foreground",
    );
    return href ? (
      <Link key={id} href={href} className={cls}>
        {inner}
      </Link>
    ) : (
      <div key={id} className={cls}>
        {inner}
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 px-2 text-xs text-muted-foreground">{t.live.moderation}</div>
        {row("moderator", t.live.moderatorRole)}
        {row("expert", t.live.expertRole)}
      </div>
      <div>
        <div className="mb-1 px-2 text-xs text-muted-foreground">{t.live.agentsOrder(round)}</div>
        {order.map((id) => row(id, agentLook(run, id, lang).unit, `/runs/${runId}/agents/${id}`))}
      </div>
      <Level min="analyst">
        {calc?.coalitions.length ? (
          <div>
            <div className="mb-1 px-2 text-xs text-muted-foreground">
              {t.live.coalitions(calc.round)}
            </div>
            <ul className="space-y-1.5 px-2 text-xs">
              {calc.coalitions.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-1">
                  {c.members.map((m) => (
                    <Tile key={m} id={m} />
                  ))}
                  <span
                    className={cn("text-muted-foreground", c.kind === "blocking" && "text-warning")}
                  >
                    {L(c.note, lang)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Level>
    </div>
  );
}

function Outline({ onJump }: { onJump: (id: string) => void }) {
  const { snap, t } = useRun();
  const [filter, setFilter] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {filter ? (
        <button type="button" className="px-2 text-xs underline" onClick={() => setFilter(null)}>
          × {filter}
        </button>
      ) : null}
      {snap.rounds.map((r) => (
        <details key={r.round} open>
          <summary className="cursor-pointer px-2 text-xs text-muted-foreground">
            {t.live.round} {r.round} · {r.utteranceIds.length}
          </summary>
          <ul className="mt-1">
            {r.utteranceIds
              .map((id) => snap.utterances[id])
              .filter((u): u is Utterance => !!u && (!filter || u.speaker === filter))
              .map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => onJump(u.id)}
                    onDoubleClick={() => setFilter(u.speaker)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-gray-alpha-100"
                  >
                    <Tile id={u.speaker} />
                    <span className="font-mono">{u.id}</span>
                    <span className="truncate text-muted-foreground">{t.kind[u.kind]}</span>
                  </button>
                </li>
              ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function SidePanel({ id }: { id: string | null }) {
  const { snap, t, lang, runId, run } = useRun();
  const u = id ? snap.utterances[id] : null;
  if (!u) {
    return <p className="text-sm text-muted-foreground">{t.live.selectHint}</p>;
  }
  const claims = u.claimIds.map((c) => snap.claims[c]).filter((c): c is Claim => !!c);
  const cites = claims.flatMap((c) => c.citations);
  const uniq = [...new Map(cites.map((c) => [c.segmentId, c])).values()];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold">
            {t.live.utterance} <span className="font-mono">{u.id}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Tile id={u.speaker} withName />
            <Chip>
              {t.live.round} {u.round}
            </Chip>
          </div>
        </div>
        <Link
          href={`/runs/${runId}/inspect/${u.id}`}
          className="shrink-0 rounded-control border px-2.5 py-1 text-xs hover:border-foreground/40"
        >
          {t.live.openInspector}
        </Link>
      </div>
      <div>
        <div className="mb-1.5 text-xs text-muted-foreground">{t.live.claims}</div>
        <div className="space-y-2">
          {claims.map((c) => (
            <ClaimRow key={c.id} claim={c} />
          ))}
          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.live.noClaims}</p>
          ) : null}
        </div>
      </div>
      {uniq.length ? (
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>{t.live.sources}</span>
            <span>{t.live.sourcesNote}</span>
          </div>
          <div className="space-y-2">
            {uniq.map((c) => (
              <SourceBlock key={c.segmentId} cite={c} />
            ))}
          </div>
        </div>
      ) : null}
      {u.deliberationSummary ? (
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">{t.live.deliberation}</div>
          <dl className="space-y-1.5 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t.live.read}</dt>
              <dd>{u.deliberationSummary.read}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.live.weighed}</dt>
              <dd>{u.deliberationSummary.weighed}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.live.wouldMove}</dt>
              <dd>{u.deliberationSummary.wouldMoveIt}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      <Level min="engineer">
        {u.telemetry ? (
          <div className="rounded-xl border p-2.5 font-mono text-[11px] text-muted-foreground">
            {u.telemetry.model} · {u.telemetry.latencyMs} ms · {u.telemetry.tokensIn}/
            {u.telemetry.tokensOut} tok · temp {u.telemetry.params.temperature ?? "-"} · seed{" "}
            {u.telemetry.params.seed ?? "-"}
          </div>
        ) : null}
      </Level>
      <p className="text-[11px] text-muted-foreground">{L(run.mandate.objective, lang)}</p>
    </div>
  );
}

function SourceBlock({ cite }: { cite: Claim["citations"][number] }) {
  const { evidence } = useRun();
  const seg = evidence.segments[cite.segmentId];
  return (
    <div className="rounded-xl border p-2.5">
      <SourceChip cite={cite} />
      {seg ? <p className="mt-1.5 text-sm">„{seg.text}“</p> : null}
    </div>
  );
}

function ExecutiveView() {
  const { snap, run, t, lang, runId, evidence } = useRun();
  const last = snap.summaries[snap.summaries.length - 1] ?? null;
  const binding = last
    ? [...last.openConflicts].sort((a, b) => b.boundBy.length - a.boundBy.length)[0]
    : null;
  return (
    <div className="space-y-4">
      {snap.status === "completed" ? (
        <section className="rounded-2xl border border-success/30 bg-success/5 p-4">
          <h3 className="font-semibold">{t.live.resultReady}</h3>
          <p className="mt-1 text-sm">{t.live.resultReadyBody}</p>
          <div className="mt-2 flex gap-2 text-sm">
            <EntityRef href={`/runs/${runId}/outcome`}>{t.nav.outcome}</EntityRef>
            <EntityRef href={`/runs/${runId}/result`}>{t.nav.result}</EntityRef>
          </div>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">{t.live.executiveHint}</p>
      {last ? <RoundSummaryCard summary={last} /> : null}
      {binding ? (
        <section className="rounded-2xl border border-warning/40 p-4">
          <div className="text-xs text-muted-foreground">{t.live.mostBinding}</div>
          <div className="mt-1 font-medium">{L(binding.note, lang)}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {binding.boundBy.map((b) => (
              <Chip key={b} className="border-warning/40 text-warning">
                {L(evidence.redLines[b]?.text, lang) || b}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}
      <section className="rounded-2xl border p-4">
        <h3 className="mb-3 font-semibold">{t.live.agreement}</h3>
        <ul className="space-y-3">
          {run.mandate.topics.map((tp) => {
            const st = topicStatus(snap, tp.id);
            return (
              <li key={tp.id}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span>
                    {L(tp.label, lang)}{" "}
                    <span className="text-muted-foreground">· {L(tp.measure, lang)}</span>
                  </span>
                  <span className="num">
                    {st.support} {t.live.of} {st.of}
                  </span>
                </div>
                <Meter value={st.of ? st.support / st.of : 0} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export function NegotiationView({
  initialView,
  initialSelected,
}: {
  initialView?: View;
  initialSelected?: string | null;
}) {
  const { snap, run, t, lang, streaming } = useRun();
  const { level } = usePrefs();
  const [view, setView] = useState<View>(
    initialView ?? (level === "engineer" ? "full" : "condensed"),
  );
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const firstTrace = Object.keys(snap.traceAvailable)[0] ?? null;
  const [selected, setSelected] = useState<string | null>(initialSelected ?? firstTrace);
  const scroller = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(snap.utteranceOrder.length);
  const [atBottom, setAtBottom] = useState(true);
  const current = snap.currentRound || 1;
  const phase = PHASES[(snap.currentPhase || 1) - 1];

  useEffect(() => {
    if (atBottom) setSeen(snap.utteranceOrder.length);
  }, [atBottom, snap.utteranceOrder.length]);

  const notesAfter = useMemo(() => {
    const m: Record<string, typeof snap.expertNotes> = {};
    for (const n of snap.expertNotes) {
      const lastId = n.utteranceIds[n.utteranceIds.length - 1];
      if (lastId) m[lastId] = [...(m[lastId] ?? []), n];
    }
    return m;
  }, [snap.expertNotes]);

  const jump = (id: string) => {
    setSelected(id);
    const u = snap.utterances[id];
    if (u) setExpanded((e) => ({ ...e, [u.round]: true }));
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const pending = Object.values(snap.pending);
  const fresh = snap.utteranceOrder.length - seen;

  return (
    <div className="grid h-[calc(100vh-94px)] grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_360px]">
      <aside className="hidden overflow-y-auto border-r p-4 lg:block">
        {view === "full" ? <Outline onJump={jump} /> : <Roster round={current} />}
      </aside>
      <div
        ref={scroller}
        className="relative overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
      >
        <div className="sticky top-0 z-[5] flex flex-wrap items-center gap-3 border-b bg-background/95 px-5 py-2.5 backdrop-blur">
          <Seg
            label={t.live.round}
            value={current}
            onChange={(r) => {
              setExpanded((e) => ({ ...e, [r]: true }));
              document.getElementById(`round-${r}`)?.scrollIntoView({ behavior: "smooth" });
            }}
            options={Array.from({ length: run.room.roundLimit }, (_, i) => ({
              value: i + 1,
              label: String(i + 1),
            }))}
          />
          <span className="text-xs text-muted-foreground">
            {t.live.roundOf(current, run.room.roundLimit)} · {t.live.phase}:{" "}
            {phase ? (lang === "de" ? phase.de : phase.en) : "-"}
          </span>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {t.live.utterancesInRound(
              snap.rounds.find((r) => r.round === current)?.utteranceIds.length ?? 0,
            )}
          </span>
          <Level min="analyst">
            <Seg
              label="view"
              value={view}
              onChange={setView}
              options={[
                { value: "condensed", label: t.live.condensed },
                { value: "full", label: t.live.full },
              ]}
            />
          </Level>
        </div>
        <div className="mx-auto max-w-[920px] space-y-3 px-5 py-4">
          <Level only="executive">
            <ExecutiveView />
          </Level>
          <Level min="analyst">
            {snap.rounds.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.live.waiting}</p>
            ) : null}
            {snap.rounds.map((r) => {
              const summary = snap.summaries.find((s) => s.round === r.round);
              const lessons = snap.lessons.filter((l) => l.round === r.round);
              const collapsed =
                view === "condensed" && !!summary && r.round !== current && !expanded[r.round];
              const ph = PHASES[r.phase - 1];
              return (
                <div key={r.round} id={`round-${r.round}`} className="scroll-mt-16 space-y-3">
                  <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    {collapsed
                      ? t.live.roundCollapsed(r.round, r.utteranceIds.length)
                      : `${t.live.round} ${r.round} · ${ph ? (lang === "de" ? ph.de : ph.en) : ""}`}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  {r.injectedEvents.map((ev) => (
                    <EventCard key={ev.id} ev={ev} />
                  ))}
                  {collapsed && summary ? (
                    <RoundSummaryCard
                      summary={summary}
                      collapsedCount={r.utteranceIds.length}
                      expanded={false}
                      onToggle={() => setExpanded((e) => ({ ...e, [r.round]: true }))}
                    />
                  ) : (
                    <>
                      {r.utteranceIds.map((id) => {
                        const u = snap.utterances[id];
                        if (!u) return null;
                        return (
                          <div key={id} className="space-y-2">
                            <UtteranceCard
                              u={u}
                              selected={selected === id}
                              onSelect={setSelected}
                            />
                            {(notesAfter[id] ?? []).map((n) => (
                              <ExpertNote key={n.seq} note={n} />
                            ))}
                          </div>
                        );
                      })}
                      {pending
                        .filter((p) => p.round === r.round)
                        .map((p) => (
                          <PendingCard
                            key={p.utteranceId}
                            id={p.utteranceId}
                            speaker={p.speaker}
                            respondsTo={p.respondsTo}
                            text={p.text}
                          />
                        ))}
                      {summary ? (
                        <RoundSummaryCard
                          summary={summary}
                          collapsedCount={
                            view === "condensed" && r.round !== current
                              ? r.utteranceIds.length
                              : undefined
                          }
                          expanded
                          onToggle={() => setExpanded((e) => ({ ...e, [r.round]: false }))}
                        />
                      ) : null}
                    </>
                  )}
                  {lessons.length ? <LessonCards round={r.round} lessons={lessons} /> : null}
                </div>
              );
            })}
            {snap.endCondition ? (
              <div className="rounded-2xl border border-success/30 bg-success/5 p-4 text-sm">
                <span className="font-semibold">{t.live.resultReady}.</span>{" "}
                {L(snap.endCondition.note, lang)}
              </div>
            ) : null}
          </Level>
        </div>
        {streaming && fresh > 0 && !atBottom ? (
          <button
            type="button"
            onClick={() => {
              const el = scroller.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            className="sticky bottom-4 left-1/2 z-10 mx-auto block -translate-x-0 rounded-full bg-foreground px-3 py-1.5 text-xs text-background shadow-md"
          >
            ↓ {t.live.newUtterances(fresh)}
          </button>
        ) : null}
      </div>
      <aside className="hidden min-w-0 overflow-x-hidden overflow-y-auto border-l p-4 xl:block">
        <SidePanel id={selected} />
      </aside>
    </div>
  );
}
