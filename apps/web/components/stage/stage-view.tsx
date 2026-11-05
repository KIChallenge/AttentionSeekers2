"use client";

import { type Claim, PHASES, type Utterance } from "@sv/contracts";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chip, Seg } from "@/components/run/bits";
import { agentLook, claimUnderline, delegateRole, fmtStance, L } from "@/components/run/helpers";
import { ClaimStateBadge, SourceChip } from "@/components/run/provenance";
import { useRun } from "@/components/run/run-context";
import { SpeakerTimeline } from "@/components/timeline/speaker-timeline";
import { cn } from "@/lib/utils";
import { type AvatarSeat, AvatarStage } from "./avatar/avatar-stage";
import { stageColumns } from "./avatar/figure-style";
import { latestShift, orderedUtterances, pickSharpestExchange, stageSpeakers } from "./stage-logic";
import { StageTile, type TileRole } from "./stage-tile";
import { useStageViewMode } from "./stage-view-mode";
import { type StageStrings, stageStrings } from "./strings";
import { useStagePlayer } from "./use-stage-player";

// Avatar stage, tier 1 (PRD 2.15). A renderer over the folded record: every word on screen
// is an utterance, claim or position from the snapshot, linked back to the transcript.

const NEUTRAL: Record<string, string> = { moderator: "#5f6b7a", expert: "#857a63" };

function useLook() {
  const { run, lang } = useRun();
  return useCallback(
    (id: string) => {
      const a = agentLook(run, id, lang);
      return { ...a, color: NEUTRAL[id] ?? a.color };
    },
    [run, lang],
  );
}

/** Subtitle body: claim spans underlined by state, source chip after each, karaoke tint. */
function SubtitleText({ u, claims, spoken }: { u: Utterance; claims: Claim[]; spoken: number }) {
  const { lang } = useRun();
  const text = L(u.text, lang);
  const original = u.text.lang === lang || !u.text.translations[lang];
  const spans = original
    ? [...claims]
        .filter((c) => c.span.end <= text.length && c.span.start < c.span.end)
        .sort((a, b) => a.span.start - b.span.start)
    : [];
  const out: ReactNode[] = [];
  const plain = (from: number, to: number, key: string, cls?: string) => {
    if (to <= from) return;
    const cut = Math.max(from, Math.min(to, spoken));
    if (cut > from)
      out.push(
        <span key={`${key}a`} className={cls}>
          {text.slice(from, cut)}
        </span>,
      );
    if (to > cut)
      out.push(
        <span key={`${key}b`} className={cn(cls, "text-muted-foreground/70")}>
          {text.slice(cut, to)}
        </span>,
      );
  };
  let pos = 0;
  for (const c of spans) {
    if (c.span.start < pos) continue;
    plain(pos, c.span.start, `p${pos}`);
    plain(
      c.span.start,
      c.span.end,
      c.id,
      cn("underline decoration-2 underline-offset-[5px]", claimUnderline[c.state]),
    );
    for (const ref of c.citations)
      out.push(<SourceChip key={`${c.id}-${ref.segmentId}`} cite={ref} compact />);
    pos = c.span.end;
  }
  plain(pos, text.length, `p${pos}`);
  if (!original) {
    for (const c of claims)
      for (const ref of c.citations)
        out.push(<SourceChip key={`${c.id}-${ref.segmentId}`} cite={ref} compact />);
  }
  return <>{out}</>;
}

function RailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-3.5">
      <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CodeBadge({ id }: { id: string }) {
  const look = useLook();
  const a = look(id);
  return (
    <span
      className="inline-grid h-5 min-w-5 place-items-center rounded-[5px] px-1 text-[10px] font-semibold text-white"
      style={{ background: a.color }}
      title={a.name}
    >
      {a.code}
    </span>
  );
}

const SPEEDS = [1, 1.5, 2, 3] as const;

export function StageView() {
  const { run, snap, lang, runId, t: rt } = useRun();
  const s: StageStrings = stageStrings[lang];
  const look = useLook();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const utterances = useMemo(() => orderedUtterances(snap), [snap]);
  const exchange = useMemo(() => pickSharpestExchange(snap), [snap]);
  const indexOf = useCallback(
    (id: string) => utterances.findIndex((u) => u.id === id),
    [utterances],
  );
  const exchangeStart = exchange ? Math.max(0, indexOf(exchange.fromId)) : 0;
  const exchangeEnd = exchange ? indexOf(exchange.toId) : -1;
  const textOf = useCallback((u: Utterance) => L(u.text, lang), [lang]);
  // FR-S8: by default the stage plays only the selected exchange (statement, then the
  // rebuttal, then stop); "whole run" plays on through the record.
  const [scope, setScope] = useState<"exchange" | "run">("exchange");
  const nextOf = useCallback(
    (i: number) => {
      if (scope === "exchange" && exchange) {
        if (i === exchangeStart) return exchangeEnd;
        if (i === exchangeEnd) return null;
      }
      return i + 1;
    },
    [scope, exchange, exchangeStart, exchangeEnd],
  );

  const p = useStagePlayer({
    runId,
    lang,
    utterances,
    textOf,
    rootRef,
    initialIndex: exchangeStart,
    nextOf,
  });
  const u = p.current;

  const speakers = useMemo(() => stageSpeakers(run), [run]);
  const replyTo = u?.respondsTo ? snap.utterances[u.respondsTo] : null;
  // who is talked to: a bilateral exchange reads as two parties facing each other
  const addressees = u ? (u.addressedTo ?? []).filter((a) => a !== u.speaker) : [];
  const role = u ? delegateRole(run, u.speaker, u.delegateId, lang) : "";
  const claims = u ? u.claimIds.map((id) => snap.claims[id]).filter((c): c is Claim => !!c) : [];
  const shift = u ? latestShift(snap, u.seq) : null;
  const phase = u ? PHASES.find((ph) => ph.n === u.phase) : null;
  const totalRounds = run.mandate.rules.rounds;
  const inExchange = !!exchange && !!u && (u.id === exchange.fromId || u.id === exchange.toId);

  // Keyboard: space play/pause, arrows step, R jumps to the rebuttal. Projector remote friendly.
  const { toggle, setIdx, idx, setPlaying } = p;
  const jumpSharpest = useCallback(() => {
    if (!exchange) return;
    setScope("exchange");
    setIdx(exchangeStart);
    setPlaying(true);
  }, [exchange, exchangeStart, setIdx, setPlaying]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") setIdx(idx + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setIdx(idx - 1);
      else if (e.key === "r" || e.key === "R") jumpSharpest();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setIdx, idx, jumpSharpest]);

  const cols = stageColumns(speakers.length);

  // View mode: tiles by default; 3D opt-in, falling back to tiles on any 3D failure.
  const [view, setView] = useStageViewMode();
  const [failed3d, setFailed3d] = useState<string | null>(null);
  const changeView = useCallback(
    (v: "grid" | "3d") => {
      if (v === "3d") setFailed3d(null);
      setView(v);
    },
    [setView],
  );
  const show3d = view === "3d" && !failed3d;
  const seats: AvatarSeat[] = speakers.map((id) => {
    const a = look(id);
    const kind: TileRole = id === "moderator" ? "moderator" : id === "expert" ? "expert" : "agent";
    const firstRole = run.agents.find((x) => x.id === id)?.delegates?.[0]?.role;
    return {
      id,
      kind,
      code: a.code,
      color: a.color,
      name: id === "moderator" ? s.moderator : id === "expert" ? s.expert : a.name,
      role: u?.speaker === id && role ? role : firstRole ? L(firstRole, lang) : "",
    };
  });
  const listeners = [
    ...addressees,
    ...(replyTo && replyTo.speaker !== u?.speaker && !addressees.includes(replyTo.speaker)
      ? [replyTo.speaker]
      : []),
  ];
  const shiftLook = shift ? look(shift.position.agentId) : null;
  const topic = shift ? run.mandate.topics.find((x) => x.id === shift.position.topicId) : null;

  return (
    <main
      ref={rootRef}
      className="grid h-[calc(100dvh-94px)] min-h-[620px] grid-cols-[minmax(0,1fr)_clamp(280px,20vw,360px)] gap-4 px-6 pt-4 pb-4"
      style={{ ["--amp" as string]: 0 }}
    >
      {/* Stage column */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{s.stageLabel}</h1>
          <span className="text-xs text-muted-foreground">{s.disclaimer}</span>
          <span className="flex-1" />
          {failed3d && view === "3d" ? (
            <Chip className="border-warning/40 bg-warning/10 text-warning" title={failed3d}>
              {s.view3dFallback}
            </Chip>
          ) : null}
          <Seg
            label={s.view}
            value={view}
            onChange={changeView}
            options={[
              { value: "grid" as const, label: s.viewGrid },
              { value: "3d" as const, label: s.view3d, title: s.view3dHint },
            ]}
          />
          <Chip
            className={cn(
              p.audioState === "on" && "border-success/30 bg-success/10 text-success",
              p.audioState === "off" && "border-warning/40 bg-warning/10 text-warning",
            )}
            title={p.audioState === "off" ? s.audioOffHint : (p.manifest?.model ?? undefined)}
          >
            {p.audioState === "on" ? "♪ " : p.audioState === "off" ? "∅ " : ""}
            {p.audioState === "on"
              ? s.audioOn
              : p.audioState === "off"
                ? s.audioOff
                : p.audioState === "rendering"
                  ? s.audioRendering
                  : s.audioLoading}
          </Chip>
        </div>

        {show3d ? (
          <AvatarStage
            seats={seats}
            cols={cols}
            cue={{
              key: u?.id ?? null,
              speaker: u?.speaker ?? null,
              listeners,
              text: u ? textOf(u) : "",
              kind: u?.kind ?? "",
            }}
            addressees={addressees}
            answeredId={replyTo && replyTo.speaker !== u?.speaker ? replyTo.speaker : null}
            liveRef={p.liveRef}
            lang={lang}
            s={s}
            onFail={setFailed3d}
          />
        ) : (
          <section
            aria-label={s.stageLabel}
            className="grid min-h-0 flex-1 gap-3"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridAutoRows: "minmax(0, 1fr)",
            }}
          >
            {speakers.map((id) => {
              const a = look(id);
              const role: TileRole =
                id === "moderator" ? "moderator" : id === "expert" ? "expert" : "agent";
              return (
                <StageTile
                  key={id}
                  role={role}
                  code={a.code}
                  color={a.color}
                  label={id === "moderator" ? s.moderator : id === "expert" ? s.expert : a.name}
                  active={u?.speaker === id}
                  answered={!!replyTo && replyTo.speaker === id && u?.speaker !== id}
                  addressed={addressees.includes(id)}
                  dimmed={!!u}
                  speakingLabel={s.speaking}
                  addressedLabel={s.addressed}
                />
              );
            })}
          </section>
        )}

        {/* Subtitles (FR-S9) */}
        <section
          aria-live="polite"
          className="relative shrink-0 rounded-2xl border bg-card px-5 py-4"
          style={u ? { borderLeft: `6px solid ${look(u.speaker).color}` } : undefined}
        >
          {u ? (
            <>
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <CodeBadge id={u.speaker} />
                <span className="font-medium text-foreground">
                  {u.speaker === "moderator"
                    ? s.moderator
                    : u.speaker === "expert"
                      ? s.expert
                      : look(u.speaker).name}
                  {role ? (
                    <span className="font-normal text-muted-foreground">, {role}</span>
                  ) : null}
                </span>
                {addressees.length ? (
                  <span className="inline-flex items-center gap-1">
                    → {s.addressedTo}
                    {addressees.map((a) => (
                      <CodeBadge key={a} id={a} />
                    ))}
                  </span>
                ) : null}
                <Chip className="bg-gray-alpha-100 font-medium">{rt.kind[u.kind]}</Chip>
                {replyTo ? (
                  <span className="inline-flex items-center gap-1">
                    ↩ {s.respondsTo} <CodeBadge id={replyTo.speaker} />
                    <span className="font-mono">{replyTo.id}</span>
                  </span>
                ) : null}
                {inExchange ? (
                  <Chip className="border-info/30 bg-info/10 text-info">{s.exchange}</Chip>
                ) : null}
                <span className="flex-1" />
                <Link
                  href={`/runs/${runId}#${u.id}`}
                  className="font-mono text-[11px] underline decoration-gray-alpha-400 underline-offset-2 hover:text-foreground"
                  title={s.inTranscript}
                >
                  {u.id} ↗
                </Link>
              </div>
              <p className="min-h-[3.4em] text-[clamp(17px,1.35vw,26px)] leading-snug text-balance">
                <SubtitleText
                  u={u}
                  claims={claims}
                  spoken={p.playing || p.spoken > 0 ? p.spoken : Number.POSITIVE_INFINITY}
                />
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">{s.claims}:</span>
                {claims.length === 0 ? (
                  <span className="text-muted-foreground">{s.noClaims}</span>
                ) : (
                  claims.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1"
                      title={c.atomicText}
                    >
                      <ClaimStateBadge state={c.state} />
                      <span className="max-w-[28ch] truncate text-muted-foreground">
                        {c.atomicText}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">{rt.live.waiting}</p>
          )}
        </section>

        {/* Transport */}
        <Transport
          s={s}
          utterances={utterances}
          idx={p.idx}
          setIdx={p.setIdx}
          playing={p.playing}
          toggle={p.toggle}
          speed={p.speed}
          setSpeed={p.setSpeed}
          exchange={exchange ? [exchangeStart, exchangeEnd] : null}
          onSharpest={jumpSharpest}
          colorOf={(id) => look(id).color}
          scope={scope}
          setScope={setScope}
        />

        {/* Speaker timeline strip, synced with playback */}
        <SpeakerTimeline
          snap={snap}
          run={run}
          lang={lang}
          activeId={u?.id ?? null}
          cursorSeq={u?.seq ?? null}
          progress={u && (p.playing || p.spoken > 0) ? p.spoken / Math.max(1, textOf(u).length) : 1}
          onSelect={(id) => p.setIdx(indexOf(id))}
          compact
          defaultZoom="follow"
          className="shrink-0"
        />
      </div>

      {/* Side rail (FR-S1: tied to the record) */}
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <RailBlock title={`${s.round} · ${s.phase}`}>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{u?.round ?? "-"}</span>
            {totalRounds ? (
              <span className="text-sm text-muted-foreground">
                {s.of} {totalRounds}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm">
            {phase ? `${phase.n}. ${lang === "de" ? phase.de : phase.en}` : "-"}
          </div>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {PHASES.map((ph) => (
              <span
                key={ph.n}
                className={cn(
                  "h-1.5 flex-1 rounded-full bg-gray-alpha-150",
                  phase && ph.n <= phase.n && "bg-foreground",
                )}
              />
            ))}
          </div>
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">
            {s.utterance} {p.idx + 1} {s.of} {utterances.length}
          </div>
        </RailBlock>

        <RailBlock title={s.latestShift}>
          {shift && shiftLook ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <CodeBadge id={shift.position.agentId} />
                <span className="font-medium">{shiftLook.name}</span>
              </div>
              <div className="text-muted-foreground">
                {topic
                  ? `${L(topic.label, lang)}: ${L(topic.measure, lang)}`
                  : shift.position.topicId}
              </div>
              <div className="flex items-center gap-2 font-mono text-base tabular-nums">
                <span className="text-muted-foreground">
                  {shift.previous ? fmtStance(shift.previous.stance) : "?"}
                </span>
                <span>→</span>
                <span className="font-semibold" style={{ color: shiftLook.color }}>
                  {fmtStance(shift.position.stance)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {rt.live.round} {shift.position.round}
                </span>
              </div>
              {shift.position.trigger ? (
                <div className="text-xs text-muted-foreground">
                  {s.trigger}:{" "}
                  <Link
                    href={`/runs/${runId}#${shift.position.trigger.utteranceId}`}
                    className="font-mono underline decoration-gray-alpha-400 underline-offset-2"
                  >
                    {shift.position.trigger.utteranceId}
                  </Link>{" "}
                  · {L(shift.position.trigger.note, lang)}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{s.noShift}</p>
          )}
        </RailBlock>

        <RailBlock title={s.exchange}>
          {exchange ? (
            <div className="space-y-2 text-sm">
              {[exchange.fromId, exchange.toId].map((id, i) => {
                const x = snap.utterances[id];
                if (!x) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => p.setIdx(indexOf(id))}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-xl border p-2 text-left hover:border-foreground/40",
                      u?.id === id && "border-foreground",
                    )}
                  >
                    <CodeBadge id={x.speaker} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {i === 1 ? `↩ ${x.id}` : x.id} · {rt.kind[x.kind]}
                      </span>
                      <span className="line-clamp-2 text-xs">{L(x.text, lang)}</span>
                    </span>
                  </button>
                );
              })}
              {exchange.shifts > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {lang === "de"
                    ? `Löste ${exchange.shifts} Positionsänderung${exchange.shifts === 1 ? "" : "en"} aus.`
                    : `Triggered ${exchange.shifts} position change${exchange.shifts === 1 ? "" : "s"}.`}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{s.noExchange}</p>
          )}
        </RailBlock>

        {p.audioState === "off" ? (
          <p className="rounded-2xl border border-dashed p-3 text-xs text-muted-foreground">
            {s.audioOffHint}
          </p>
        ) : null}
      </aside>
    </main>
  );
}

function Transport({
  s,
  utterances,
  idx,
  setIdx,
  playing,
  toggle,
  speed,
  setSpeed,
  exchange,
  onSharpest,
  colorOf,
  scope,
  setScope,
}: {
  s: StageStrings;
  utterances: Utterance[];
  idx: number;
  setIdx: (i: number) => void;
  playing: boolean;
  toggle: () => void;
  speed: number;
  setSpeed: (n: number) => void;
  exchange: [number, number] | null;
  onSharpest: () => void;
  colorOf: (id: string) => string;
  scope: "exchange" | "run";
  setScope: (v: "exchange" | "run") => void;
}) {
  const btn =
    "grid h-9 shrink-0 place-items-center rounded-control border px-3 text-sm hover:border-foreground/40 disabled:opacity-40";
  // Round boundaries for the timeline ticks.
  const roundStarts = utterances
    .map((u, i) => (i === 0 || utterances[i - 1]?.round !== u.round ? { i, r: u.round } : null))
    .filter((x): x is { i: number; r: number } => x !== null);
  const n = Math.max(1, utterances.length);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        className={btn}
        onClick={() => setIdx(idx - 1)}
        disabled={idx <= 0}
        aria-label={s.prev}
        title={`${s.prev} (←)`}
      >
        ⏮
      </button>
      <button
        type="button"
        className={cn(
          btn,
          "min-w-32 whitespace-nowrap bg-foreground text-background hover:bg-foreground/90",
        )}
        onClick={toggle}
        title={`${playing ? s.pause : s.play} (Space)`}
      >
        {playing ? `❚❚ ${s.pause}` : `▶ ${s.play}`}
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => setIdx(idx + 1)}
        disabled={idx >= utterances.length - 1}
        aria-label={s.next}
        title={`${s.next} (→)`}
      >
        ⏭
      </button>
      <button
        type="button"
        className={cn(btn, "border-info/40 text-info")}
        onClick={onSharpest}
        disabled={!exchange}
        title={`${s.sharpestHint} (R)`}
      >
        ⚡ {s.sharpest}
      </button>

      {/* Timeline: one segment per utterance in the speaker's colour */}
      <fieldset className="relative mx-2 h-9 min-w-0 flex-1" aria-label={s.timeline}>
        <div className="absolute inset-x-0 top-3 flex h-3 gap-px overflow-hidden rounded-full">
          {utterances.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setIdx(i)}
              title={`${u.id} · ${u.speaker}`}
              aria-label={u.id}
              aria-current={i === idx ? "step" : undefined}
              className={cn(
                "h-full flex-1 transition-opacity hover:opacity-100",
                i === idx ? "opacity-100" : i < idx ? "opacity-70" : "opacity-25",
              )}
              style={{ background: colorOf(u.speaker) }}
            />
          ))}
        </div>
        {exchange ? (
          <span
            className="pointer-events-none absolute top-1.5 h-6 rounded-md border-2 border-info"
            style={{
              left: `calc(${(exchange[0] / n) * 100}% - 2px)`,
              width: `calc(${((exchange[1] - exchange[0] + 1) / n) * 100}% + 4px)`,
            }}
          />
        ) : null}
        <span
          className="pointer-events-none absolute top-0.5 h-8 w-0.5 rounded bg-foreground"
          style={{ left: `calc(${((idx + 0.5) / n) * 100}% - 1px)` }}
        />
        {roundStarts.map(({ i, r }) => (
          <span
            key={r}
            className="pointer-events-none absolute -bottom-1 font-mono text-[10px] text-muted-foreground"
            style={{ left: `${(i / n) * 100}%` }}
          >
            R{r}
          </span>
        ))}
      </fieldset>

      <Seg
        label={s.scope}
        value={scope}
        onChange={setScope}
        options={[
          { value: "exchange" as const, label: s.scopeExchange, title: s.sharpestHint },
          { value: "run" as const, label: s.scopeRun },
        ]}
      />
      <Seg
        label={s.speed}
        value={speed}
        onChange={setSpeed}
        options={SPEEDS.map((v) => ({ value: v, label: `${v}x` }))}
      />
    </div>
  );
}
