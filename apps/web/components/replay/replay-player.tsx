"use client";

import { NextIcon, PreviousIcon, RotateLeft01Icon } from "@hugeicons/core-free-icons";
import {
  catalogAgent,
  emptySnapshot,
  PHASES,
  type RunEvent,
  type RunSnapshot,
  reduceRun,
} from "@sv/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { laneT } from "@/components/entity/messages";
import {
  PlaybackButton,
  PlaybackGroup,
  PlayPauseButton,
  Segmented,
} from "@/components/playback/controls";
import { playbackKeys } from "@/components/playback/strings";
import { AgentTile } from "@/components/run/agent-tile";
import { usePrefs } from "@/components/shell/providers";
import { SpeakerTimeline } from "@/components/timeline/speaker-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/format";
import { buildMarks, Scrubber } from "./scrubber";
import { PositionGrid, ProposalList } from "./side-panel";
import { Transcript } from "./transcript";

// Replay player (W-44, NFR-2). All events are loaded once; the player folds the prefix up
// to the playhead with the shared reducer, so seeking backwards is exact. Gaps between
// events follow the recorded tMs divided by speed, capped like the stream route.
const SPEEDS = [1, 2, 4, 8] as const;
const MAX_GAP_MS = 1500;

export function ReplayPlayer({ runId, events }: { runId: string; events: RunEvent[] }) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  const k = playbackKeys[lang];
  // snaps[i] = state after the first i events (structural sharing keeps this cheap)
  const snaps = useMemo(() => {
    const out: RunSnapshot[] = [emptySnapshot()];
    for (const e of events) out.push(reduceRun(out[out.length - 1] as RunSnapshot, e));
    return out;
  }, [events]);
  const marks = useMemo(
    () => buildMarks(events, (id) => catalogAgent(id)?.color ?? "var(--foreground)"),
    [events],
  );
  const [pos, setPos] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(4);
  const [follow, setFollow] = useState(true);
  const s = snaps[pos] ?? snaps[0] ?? emptySnapshot();
  const end = events.length;

  // playback clock
  useEffect(() => {
    if (!playing) return;
    if (pos >= end) {
      setPlaying(false);
      return;
    }
    const prev = events[pos - 1]?.tMs ?? 0;
    const next = events[pos]?.tMs ?? prev;
    const gap = Math.min(MAX_GAP_MS, Math.max(0, next - prev)) / speed;
    const timer = setTimeout(() => setPos((p) => Math.min(end, p + 1)), gap);
    return () => clearTimeout(timer);
  }, [playing, pos, speed, end, events]);

  const seek = useCallback(
    (idx: number) => {
      setPos(Math.max(1, Math.min(end, idx)));
    },
    [end],
  );
  const seekRound = useCallback(
    (round: number) => {
      const m = marks.rounds.find((r) => r.round === round);
      if (m) {
        seek(m.idx + 1);
        setFollow(false);
        requestAnimationFrame(() =>
          document
            .getElementById(`round-${round}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    },
    [marks, seek],
  );
  const seekUtterance = useCallback(
    (id: string) => {
      const m = marks.utterances.find((u) => u.id === id);
      if (m) {
        seek(m.idx + 1);
        setFollow(false);
        requestAnimationFrame(() =>
          document
            .getElementById(`utt-${id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        );
      }
    },
    [marks, seek],
  );

  // keyboard: space, arrows, shift+arrows
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable)
        return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => {
          if (!p && pos >= end) setPos(1);
          return !p;
        });
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        if (e.shiftKey) {
          const r = Math.max(1, Math.min(marks.rounds.length, (s.currentRound || 1) + dir));
          seekRound(r);
        } else seek(pos + dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos, end, marks, s.currentRound, seek, seekRound]);

  // follow the newest utterance while playing
  const lastUtt = s.utteranceOrder.at(-1) ?? null;
  const pendingId = Object.keys(s.pending)[0] ?? null;
  const scrollTarget = pendingId ?? lastUtt;
  const prevTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!follow || !playing || !scrollTarget || scrollTarget === prevTarget.current) return;
    prevTarget.current = scrollTarget;
    const el = document.querySelector(`[data-utterance="${scrollTarget}"], [aria-busy]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [scrollTarget, follow, playing]);

  const phase = PHASES[s.currentPhase - 1];
  const total = events.at(-1)?.tMs ?? 0;
  // the timeline draws the whole record; what lies past the scrubber is a ghost
  const full = snaps[end] ?? s;
  const cursorUtt = pendingId ?? lastUtt;
  const cursorSeq = cursorUtt ? (full.utterances[cursorUtt]?.seq ?? 0) - (pendingId ? 1 : 0) : 0;
  const utterIds = marks.utterances.map((u) => u.id);

  return (
    <div className="space-y-4">
      {/* sticky transport */}
      <div className="sticky top-[50px] z-10 -mx-4 border-b bg-background/95 px-4 pt-3 pb-1 backdrop-blur sm:-mx-8 sm:px-8">
        <PlaybackGroup
          label={base.replay.title}
          className="flex-wrap gap-2"
          data-replay-transport=""
        >
          <PlaybackButton
            icon={PreviousIcon}
            label={t.replay.prevEvent}
            shortcut={k.left}
            keys="ArrowLeft"
            onClick={() => seek(pos - 1)}
            disabled={pos <= 1}
          />
          <PlayPauseButton
            playing={playing}
            onToggle={() => {
              if (!playing && pos >= end) setPos(1);
              setPlaying((p) => !p);
              setFollow(true);
            }}
            labels={{ play: base.replay.play, pause: base.replay.pause }}
            shortcut={k.space}
          />
          <PlaybackButton
            icon={NextIcon}
            label={t.replay.nextEvent}
            shortcut={k.right}
            keys="ArrowRight"
            onClick={() => seek(pos + 1)}
            disabled={pos >= end}
          />
          <PlaybackButton
            icon={RotateLeft01Icon}
            label={base.replay.restart}
            onClick={() => {
              setPos(1);
              setPlaying(true);
              setFollow(true);
            }}
          />
          <Segmented
            label={base.replay.speed}
            value={speed}
            onChange={setSpeed}
            options={SPEEDS.map((x) => ({ value: x, label: `${x}x` }))}
            className="ml-1"
          />
          <span className="flex-1" />
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t.replay.jumpRound}
          </span>
          <Segmented
            label={t.replay.jumpRound}
            shortcut={`${k.shift} + ${k.left} ${k.right}`}
            value={s.currentRound || 0}
            onChange={seekRound}
            options={marks.rounds.map((r) => ({ value: r.round, label: String(r.round) }))}
          />
          <Select value={lastUtt ?? undefined} onValueChange={seekUtterance}>
            <SelectTrigger className="h-9 w-40 rounded-full" aria-label={t.replay.jumpUtterance}>
              <SelectValue placeholder={t.replay.jumpUtterance} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {utterIds.map((id) => {
                const ev = events[marks.utterances.find((u) => u.id === id)?.idx ?? 0];
                const sp = ev?.type === "utterance.completed" ? ev.utterance.speaker : "";
                return (
                  <SelectItem key={id} value={id}>
                    <span className="font-mono text-xs">{id}</span>
                    <span className="text-xs text-muted-foreground">
                      {catalogAgent(sp)?.code ?? sp}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </PlaybackGroup>
        <Scrubber
          events={events}
          marks={marks}
          pos={pos}
          onSeek={(i) => {
            seek(i);
            setFollow(true);
          }}
          labels={{
            round: "R",
            change: t.replay.positionChange,
            injected: t.replay.injected,
            timeline: lang === "de" ? "Zeitachse" : "Timeline",
          }}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-[11px] text-muted-foreground">
          <span className="num">
            {formatDuration(s.lastTMs)} {t.replay.of} {formatDuration(total)}
          </span>
          <span className="num">
            {base.replay.events} {pos}/{end}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-[3px] rounded-full bg-[var(--c-va)]" />{" "}
            {t.replay.positionChange}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-px bg-foreground" /> {base.run.utterances}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rotate-45 border border-warning bg-warning/30" />{" "}
            {t.replay.injected}
          </span>
          <span className="hidden md:inline">{t.replay.shortcuts}</span>
        </div>
      </div>

      {/* heading */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{base.replay.title}</Badge>
            <Badge variant="outline" className="num">
              {base.run.round} {s.currentRound || "–"} ·{" "}
              {phase ? (lang === "de" ? phase.de : phase.en) : ""}
            </Badge>
            {s.activeSpeaker ? (
              <Badge variant="outline" className="gap-1 border-success/40 text-success">
                <AgentTile agentId={s.activeSpeaker} /> {t.replay.speaking}
              </Badge>
            ) : null}
            <span className="font-mono text-xs text-muted-foreground">{runId}</span>
          </div>
          <h1 className="text-xl leading-snug">{s.run?.mandate.question ?? t.replay.loading}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/runs/${runId}`}>{t.replay.openLive}</Link>
          </Button>
        </div>
      </div>

      <SpeakerTimeline
        snap={full}
        run={full.run}
        lang={lang}
        activeId={cursorUtt}
        selectedId={lastUtt}
        cursorSeq={cursorSeq}
        progress={pendingId ? 0.5 : 1}
        onSelect={seekUtterance}
        collapsible
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Transcript s={s} lang={lang} currentUtterance={lastUtt} onSelect={seekUtterance} />
        <aside className="space-y-3 lg:sticky lg:top-[214px] lg:self-start">
          <PositionGrid s={s} lang={lang} />
          <ProposalList s={s} lang={lang} />
        </aside>
      </div>
    </div>
  );
}
