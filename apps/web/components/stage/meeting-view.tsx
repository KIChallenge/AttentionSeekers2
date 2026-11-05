"use client";

import {
  type CSSProperties,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import type { StageCue } from "./avatar/avatar-scene";
import {
  type AvatarLayout,
  type AvatarSeat,
  AvatarStage,
  type SeatState,
} from "./avatar/avatar-stage";
import { captionChunks, chunkAt, meetingLayout, type Rect } from "./meeting-logic";
import { StageFigure } from "./stage-tile";
import type { StageStrings } from "./strings";
import type { StageLive } from "./use-stage-player";

// Meeting view of the stage (PRD 2.15): the negotiation as a video call. Only the participants
// on a dark call background, the active speaker in the spotlight with a speaking ring, the
// addressed seats subtly marked, name plates with institution and role, and live captions of
// the sentence being spoken. No transcript, timeline, rail or evidence: the regular stage and
// the record stay one click away. 3D figures when WebGL works, the tile emblems otherwise.

const SPEEDS = [1, 1.5, 2, 3] as const;
const IDLE_MS = 2600;
const GAP = 12;

export interface MeetingPlayer {
  idx: number;
  total: number;
  setIdx: (i: number) => void;
  playing: boolean;
  toggle: () => void;
  speed: number;
  setSpeed: (n: number) => void;
  /** Characters of the current utterance already spoken (word steps). */
  spoken: number;
  liveRef: RefObject<StageLive>;
}

export function MeetingView({
  seats,
  cue,
  addressees,
  player,
  lang,
  s,
  use3d,
  onFail3d,
  onExit,
  round,
}: {
  seats: AvatarSeat[];
  cue: StageCue;
  addressees: string[];
  player: MeetingPlayer;
  lang: "de" | "en";
  s: StageStrings;
  use3d: boolean;
  onFail3d: (why: string) => void;
  onExit: () => void;
  round: number | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ids = useMemo(() => seats.map((x) => x.id), [seats]);
  const rects = useMemo(
    () => (size.w > 0 ? meetingLayout(ids, cue.speaker, size.w, size.h, GAP) : {}),
    [ids, cue.speaker, size.w, size.h],
  );

  // Controls fade out while playing and idle; any pointer move or key brings them back.
  const [awake, setAwake] = useState(true);
  const timer = useRef(0);
  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => window.clearTimeout(timer.current);
  }, [wake]);
  const showControls = awake || !player.playing;

  // Fullscreen API on the call itself, so only the call fills the projector.
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }, []);
  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onExit();
  }, [onExit]);

  const { speed, setSpeed } = player;
  const cycleSpeed = useCallback(() => {
    const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length] ?? 1);
  }, [speed, setSpeed]);

  // Keys on top of the stage's own (space, arrows, R): F fullscreen, S speed, Esc leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      wake();
      if (e.key === "f" || e.key === "F") toggleFull();
      else if (e.key === "s" || e.key === "S") cycleSpeed();
      else if (e.key === "Escape" && !document.fullscreenElement) exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wake, toggleFull, cycleSpeed, exit]);

  const seatState = (id: string): SeatState => {
    const active = cue.speaker === id;
    return { active, addressed: !active && addressees.includes(id), answered: false };
  };
  const frameClass = (_: AvatarSeat, st: SeatState) =>
    cn("rounded-xl", st.active ? "z-20" : "z-10");
  const frameStyle = (seat: AvatarSeat, st: SeatState): CSSProperties => ({
    boxShadow: st.active
      ? `0 0 0 3px ${seat.color}, 0 0 0 calc(3px + var(--amp, 0) * 7px) color-mix(in srgb, ${seat.color} 45%, transparent), 0 18px 48px -12px rgb(0 0 0 / 0.7)`
      : st.addressed
        ? `0 0 0 2px color-mix(in srgb, ${seat.color} 75%, transparent)`
        : "0 0 0 1px rgb(255 255 255 / 0.06)",
  });
  const plate = (seat: AvatarSeat, st: SeatState) => (
    <NamePlate seat={seat} st={st} big={(rects[seat.id]?.w ?? 0) > 560} s={s} />
  );
  const layout: AvatarLayout = {
    rects,
    tint: [0.1, 0.16],
    frameScale: 1.4,
    frameClass,
    frameStyle,
    plate,
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={s.meetingLabel}
      data-stage-view="meeting"
      onPointerMove={wake}
      onPointerDown={wake}
      className={cn(
        "dark fixed inset-0 z-[70] flex flex-col overflow-hidden text-white",
        !showControls && "cursor-none",
      )}
      style={{
        background: "radial-gradient(120% 90% at 50% 35%, #1a1f29 0%, #0e1117 60%, #090b0f 100%)",
      }}
    >
      {/* top bar: what this is and which round, fades with the controls */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-3 px-6 py-3 text-sm text-white/70 transition-opacity duration-500",
          showControls ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
          {s.stageLabel}
        </span>
        {round ? (
          <span>
            {s.round} {round}
          </span>
        ) : null}
        <span className="flex-1" />
        <span className="hidden text-xs text-white/45 md:inline">{s.meetingKeys}</span>
      </div>

      <div className="relative min-h-0 flex-1 px-[clamp(12px,2vw,32px)] pt-[clamp(40px,5vh,56px)]">
        <div ref={areaRef} className="relative h-full w-full">
          {use3d ? (
            <AvatarStage
              seats={seats}
              cols={4}
              cue={cue}
              addressees={addressees}
              answeredId={null}
              liveRef={player.liveRef}
              lang={lang}
              s={s}
              onFail={onFail3d}
              layout={layout}
              className="absolute inset-0"
            />
          ) : (
            <section aria-label={s.stageLabel} className="absolute inset-0">
              {seats.map((seat) => {
                const st = seatState(seat.id);
                const r: Rect | undefined = rects[seat.id];
                return (
                  <figure
                    key={seat.id}
                    data-seat={seat.id}
                    data-active={st.active || undefined}
                    aria-label={st.active ? `${seat.name}, ${s.speaking}` : seat.name}
                    className={cn("absolute m-0 overflow-hidden", frameClass(seat, st))}
                    style={{
                      left: r?.x ?? 0,
                      top: r?.y ?? 0,
                      width: r?.w ?? 0,
                      height: r?.h ?? 0,
                      visibility: r ? undefined : "hidden",
                      transition:
                        "left 450ms ease, top 450ms ease, width 450ms ease, height 450ms ease, box-shadow 250ms ease",
                      background: `radial-gradient(90% 80% at 50% 40%, color-mix(in srgb, ${seat.color} ${st.active ? 26 : 14}%, #161a22) 0%, #12151c 100%)`,
                      ...frameStyle(seat, st),
                    }}
                  >
                    <div className="absolute bottom-0 left-1/2 aspect-square h-[86%] max-w-full -translate-x-1/2">
                      <StageFigure
                        role={seat.kind}
                        color={seat.color}
                        code={seat.code}
                        active={st.active}
                      />
                    </div>
                    {plate(seat, st)}
                  </figure>
                );
              })}
            </section>
          )}
        </div>

        <Controls
          s={s}
          player={player}
          visible={showControls}
          full={full}
          onFull={toggleFull}
          onSpeed={cycleSpeed}
          onExit={exit}
        />
      </div>

      <Captions cue={cue} seats={seats} player={player} s={s} />
    </div>
  );
}

function NamePlate({
  seat,
  st,
  big,
  s,
}: {
  seat: AvatarSeat;
  st: SeatState;
  big: boolean;
  s: StageStrings;
}) {
  return (
    <figcaption
      className={cn(
        "absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] min-w-0 items-center gap-2 rounded-lg bg-black/60 text-white backdrop-blur-sm",
        big ? "px-3 py-1.5" : "px-2 py-1",
      )}
    >
      {st.active ? <SpeakingBars color={seat.color} /> : null}
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-[5px] font-semibold text-white",
          big ? "h-6 min-w-6 px-1.5 text-xs" : "h-5 min-w-5 px-1 text-[10px]",
        )}
        style={{ background: seat.color }}
      >
        {seat.code}
      </span>
      <span className={cn("min-w-0 truncate leading-tight", big ? "text-base" : "text-xs")}>
        <span className="font-medium">{seat.name}</span>
        {seat.role ? (
          <span className={cn("text-white/65", big ? "text-sm" : "text-[11px]")}>
            {" "}
            · {seat.role}
          </span>
        ) : null}
      </span>
      {st.addressed ? (
        <span
          className="shrink-0 text-[11px] font-medium"
          style={{ color: `color-mix(in srgb, ${seat.color} 60%, white)` }}
        >
          {s.addressed}
        </span>
      ) : null}
    </figcaption>
  );
}

function SpeakingBars({ color }: { color: string }) {
  return (
    <span className="flex h-4 shrink-0 items-center gap-[2px]" aria-hidden="true">
      {[0.6, 1, 0.75].map((k, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
          key={i}
          className="block h-full w-[3px] origin-center rounded-full"
          style={{
            background: `color-mix(in srgb, ${color} 55%, white)`,
            transform: `scaleY(calc(0.25 + var(--amp, 0) * ${k}))`,
          }}
        />
      ))}
    </span>
  );
}

/** Live captions: only the sentence being spoken, advancing with the audio. */
function Captions({
  cue,
  seats,
  player,
  s,
}: {
  cue: StageCue;
  seats: AvatarSeat[];
  player: MeetingPlayer;
  s: StageStrings;
}) {
  const chunks = useMemo(() => captionChunks(cue.text), [cue.text]);
  // `spoken` re-renders this at word steps; the chunk changes far less often
  const p = cue.text.length ? player.spoken / cue.text.length : 0;
  const i = chunkAt(chunks, p, cue.text.length);
  const chunk = chunks[i];
  const seat = seats.find((x) => x.id === cue.speaker);
  return (
    <div
      className="relative z-30 flex shrink-0 flex-col items-center justify-end px-[5vw] pt-3 pb-[clamp(14px,3vh,32px)]"
      style={{ minHeight: "calc(2 * 1.28 * clamp(22px, 2.25vw, 44px) + 56px)" }}
    >
      {seat ? (
        <div className="mb-1.5 flex items-center gap-2 text-[clamp(12px,0.95vw,17px)] text-white/75">
          <span
            className="inline-grid h-5 min-w-5 place-items-center rounded-[5px] px-1 text-[10px] font-semibold text-white"
            style={{ background: seat.color }}
          >
            {seat.code}
          </span>
          {seat.name}
        </div>
      ) : null}
      <p
        aria-live="polite"
        data-caption-index={i}
        className="max-w-[min(1560px,92vw)] text-center text-[clamp(22px,2.25vw,44px)] leading-[1.28] font-medium text-balance"
      >
        {chunk ? (
          <span className="rounded-md bg-black/80 box-decoration-clone px-[0.35em] py-[0.08em] text-white">
            {chunk.text}
          </span>
        ) : (
          <span className="text-white/50">{s.meetingWaiting}</span>
        )}
      </p>
    </div>
  );
}

function Controls({
  s,
  player,
  visible,
  full,
  onFull,
  onSpeed,
  onExit,
}: {
  s: StageStrings;
  player: MeetingPlayer;
  visible: boolean;
  full: boolean;
  onFull: () => void;
  onSpeed: () => void;
  onExit: () => void;
}) {
  const btn =
    "grid h-11 min-w-11 place-items-center rounded-full px-3 text-[15px] text-white/90 hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-35";
  // buttons never keep focus, so Space stays play/pause and never re-clicks a button
  const noFocus = (e: MouseEvent) => e.preventDefault();
  return (
    <div
      className={cn(
        "absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[#0b0d12]/85 px-2 py-1.5 shadow-2xl backdrop-blur-md transition-opacity duration-500",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      data-meeting-controls={visible ? "shown" : "hidden"}
    >
      <button
        type="button"
        className={btn}
        onMouseDown={noFocus}
        onClick={() => player.setIdx(player.idx - 1)}
        disabled={player.idx <= 0}
        aria-label={s.prev}
        title={`${s.prev} (←)`}
      >
        ⏮
      </button>
      <button
        type="button"
        className={cn(btn, "min-w-14 bg-white text-[#0b0d12] hover:bg-white/90")}
        onMouseDown={noFocus}
        onClick={player.toggle}
        aria-label={player.playing ? s.pause : s.play}
        title={`${player.playing ? s.pause : s.play} (Space)`}
      >
        {player.playing ? "❚❚" : "▶"}
      </button>
      <button
        type="button"
        className={btn}
        onMouseDown={noFocus}
        onClick={() => player.setIdx(player.idx + 1)}
        disabled={player.idx >= player.total - 1}
        aria-label={s.next}
        title={`${s.next} (→)`}
      >
        ⏭
      </button>
      <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
      <button
        type="button"
        className={cn(btn, "font-mono text-sm tabular-nums")}
        onMouseDown={noFocus}
        onClick={onSpeed}
        aria-label={`${s.speed} ${player.speed}x`}
        title={`${s.speed} (S)`}
      >
        {player.speed}x
      </button>
      <span className="px-2 font-mono text-xs text-white/55 tabular-nums">
        {player.idx + 1}/{player.total}
      </span>
      <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
      <button
        type="button"
        className={btn}
        onMouseDown={noFocus}
        onClick={onFull}
        aria-label={full ? s.meetingFullscreenExit : s.meetingFullscreen}
        aria-pressed={full}
        title={`${full ? s.meetingFullscreenExit : s.meetingFullscreen} (F)`}
      >
        {full ? "⤡" : "⛶"}
      </button>
      <button
        type="button"
        className={cn(btn, "bg-red-600/90 text-white hover:bg-red-600")}
        onMouseDown={noFocus}
        onClick={onExit}
        aria-label={s.meetingExit}
        title={`${s.meetingExit} (Esc)`}
      >
        ✕
      </button>
    </div>
  );
}
