"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TileRole } from "../stage-tile";
import type { StageStrings } from "../strings";
import type { StageLive } from "../use-stage-player";
import type { AvatarScene, StageCue } from "./avatar-scene";
import { figureStyle } from "./figure-style";

// 3D mode of the stage (PRD 2.15). Same grid as the tile view, but each tile is a viewport
// into one shared WebGL canvas. The tiles themselves are transparent frames carrying the name
// plate (institution code, name, delegate role; never a personal name, FR-S7). three.js and
// TalkingHead are imported only when this mode mounts. Any failure (no WebGL, asset missing,
// context lost, load timeout) calls onFail and the stage falls back to the tile grid.

export interface AvatarSeat {
  id: string;
  code: string;
  /** CSS colour (token or hex). */
  color: string;
  name: string;
  role: string;
  kind: TileRole;
}

const ASSET = "/avatars/figure.glb";
const LOAD_TIMEOUT_MS = 30_000;

type Rgb = [number, number, number];

/** Resolve any CSS colour (var(), oklch, hex) to sRGB bytes via a 1px 2D canvas. */
function makeResolver(host: HTMLElement) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (css: string): Rgb => {
    const probe = document.createElement("span");
    probe.style.color = css;
    host.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    if (!ctx) return [128, 128, 128];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#808080";
    ctx.fillStyle = computed;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 128, d[1] ?? 128, d[2] ?? 128];
  };
}

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function AvatarStage({
  seats,
  cols,
  cue,
  addressees,
  answeredId,
  liveRef,
  lang,
  s,
  onFail,
}: {
  seats: AvatarSeat[];
  cols: number;
  cue: StageCue;
  addressees: string[];
  answeredId: string | null;
  liveRef: RefObject<StageLive>;
  lang: "de" | "en";
  s: StageStrings;
  onFail: (why: string) => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const sceneRef = useRef<AvatarScene | null>(null);
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const [progress, setProgress] = useState<[number, number]>([0, seats.length]);

  const seatKey = seats.map((x) => `${x.id}:${x.color}`).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt only when the seats change
  const seatList = useMemo(() => seats, [seatKey]);

  const measure = useCallback(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const base = canvas.getBoundingClientRect();
    const rects = new Map<string, DOMRect>();
    for (const [id, el] of tileRefs.current) {
      const r = el.getBoundingClientRect();
      // inside the 1px border so the frame stays crisp
      rects.set(id, new DOMRect(r.x - base.x + 1, r.y - base.y + 1, r.width - 2, r.height - 2));
    }
    scene.setRects(base.width, base.height, rects);
  }, []);

  const paintBackgrounds = useCallback(() => {
    const scene = sceneRef.current;
    const host = sectionRef.current;
    if (!scene || !host) return;
    const resolve = makeResolver(host);
    const card = resolve("var(--card)");
    const bg = new Map<string, string>();
    for (const seat of seatList) {
      const t = seat.id === cueRef.current.speaker ? 0.2 : 0.08;
      bg.set(seat.id, hex(mix(card, resolve(seat.color), t)));
    }
    scene.setBackgrounds(bg);
  }, [seatList]);

  // Build the scene once per seat set and language.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = sectionRef.current;
    if (!canvas || !host) return;
    let alive = true;
    let loaded = false;
    let scene: AvatarScene | null = null;
    const fail = (why: string) => {
      if (!alive) return;
      alive = false;
      console.warn(`[stage] 3D mode unavailable, falling back to tiles: ${why}`);
      failRef.current(why);
    };
    if (!hasWebGL2()) {
      fail("WebGL 2 not available");
      return;
    }
    const timer = window.setTimeout(() => {
      if (!loaded) fail("figure load timed out");
    }, LOAD_TIMEOUT_MS);

    void (async () => {
      try {
        const mod = await import("./avatar-scene");
        if (!alive) return;
        const resolve = makeResolver(host);
        const card = resolve("var(--card)");
        scene = new mod.AvatarScene(canvas, {
          url: ASSET,
          lang,
          cols,
          live: liveRef,
          onLost: fail,
        });
        sceneRef.current = scene;
        const specs = seatList.flatMap((seat) => {
          const el = tileRefs.current.get(seat.id);
          if (!el) return [];
          const rgb = resolve(seat.color);
          return [
            {
              id: seat.id,
              el,
              bg: hex(mix(card, rgb, 0.08)),
              style: figureStyle(seat.id, hex(seat.kind === "agent" ? rgb : mix(rgb, card, 0.15))),
            },
          ];
        });
        measure();
        scene.setCue(cueRef.current);
        scene.start();
        await scene.load(specs, (done, total) => {
          if (!alive) return;
          loaded = true;
          setProgress([done, total]);
        });
        if (alive) paintBackgrounds();
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [seatList, lang, cols, liveRef, measure, paintBackgrounds]);

  // Layout: follow the section's size.
  useEffect(() => {
    const host = sectionRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Theme switch: re-resolve the tile backgrounds.
  useEffect(() => {
    const mo = new MutationObserver(() => paintBackgrounds());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => mo.disconnect();
  }, [paintBackgrounds]);

  const listenersKey = cue.listeners.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on turn, speaker, listeners
  useEffect(() => {
    sceneRef.current?.setCue(cueRef.current);
    paintBackgrounds();
  }, [cue.key, cue.speaker, listenersKey, paintBackgrounds]);

  const loading = progress[0] < progress[1];

  return (
    <section
      ref={sectionRef}
      aria-label={s.stageLabel}
      className="relative grid min-h-0 flex-1 gap-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(0, 1fr)",
      }}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {seats.map((seat) => {
        const active = cue.speaker === seat.id;
        const addressed = !active && addressees.includes(seat.id);
        const answered = !active && !addressed && answeredId === seat.id;
        return (
          <figure
            key={seat.id}
            ref={(el) => {
              if (el) tileRefs.current.set(seat.id, el);
              else tileRefs.current.delete(seat.id);
            }}
            aria-label={
              active
                ? `${seat.name}, ${s.speaking}`
                : addressed
                  ? `${seat.name}, ${s.addressed}`
                  : seat.name
            }
            title={seat.name}
            data-active={active || undefined}
            className="relative z-10 min-h-0 min-w-0 overflow-hidden rounded-lg border transition-shadow duration-300"
            style={{
              boxShadow: active
                ? `0 0 0 4px ${seat.color}, 0 12px 32px -8px color-mix(in srgb, ${seat.color} 55%, transparent)`
                : addressed
                  ? `0 0 0 3px color-mix(in srgb, ${seat.color} 80%, transparent)`
                  : answered
                    ? `0 0 0 2px color-mix(in srgb, ${seat.color} 60%, transparent)`
                    : undefined,
            }}
          >
            <figcaption className="absolute inset-x-1.5 bottom-1.5 flex min-w-0 items-center gap-2 rounded-md border bg-card/90 px-2 py-1 shadow-xs backdrop-blur-sm">
              <span
                className="inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-[5px] px-1 text-[10px] font-semibold text-white"
                style={{ background: seat.color }}
              >
                {seat.code}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-medium">{seat.name}</span>
                {seat.role ? (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {seat.role}
                  </span>
                ) : null}
              </span>
              {active ? (
                <span className="shrink-0 text-xs font-medium" style={{ color: seat.color }}>
                  {s.speaking}
                </span>
              ) : addressed ? (
                <span className="shrink-0 text-xs font-medium" style={{ color: seat.color }}>
                  ← {s.addressed}
                </span>
              ) : answered ? (
                <span className="shrink-0 text-xs text-muted-foreground">↩</span>
              ) : null}
            </figcaption>
          </figure>
        );
      })}
      {loading ? (
        <div
          role="status"
          className={cn(
            "pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-xs",
          )}
        >
          {s.view3dLoading} {progress[0]}/{progress[1]}
        </div>
      ) : null}
    </section>
  );
}
