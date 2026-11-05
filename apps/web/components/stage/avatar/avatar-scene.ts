// 3D stage engine (PRD 2.15, tier 2 as an opt-in mode). One WebGL canvas, one three.js scene,
// one TalkingHead instance per seat in avatar-only mode. Seats are laid out in world space as a
// mirror of the tile grid, and every tile gets its own portrait camera rendered into its
// scissor rectangle, so a figure turning toward the speaker turns toward the speaker's tile.
// This module is only ever loaded through dynamic import() from the 3D mode, so three.js and
// TalkingHead stay out of the default stage bundle.

import { type GltfLike, TalkingHead } from "@met4citizen/talkinghead";
import { LipsyncDe } from "@met4citizen/talkinghead/modules/lipsync-de.mjs";
import { LipsyncEn } from "@met4citizen/talkinghead/modules/lipsync-en.mjs";
import * as THREE from "three";
import type { StageLive } from "../use-stage-player";
import { type FigureStyle, seatPosition } from "./figure-style";
import {
  ampGate,
  buildTrack,
  type LipsyncProcessor,
  VISEMES,
  type Viseme,
  type VisemeTrack,
  visemeWeights,
} from "./visemes";

export interface SeatSpec {
  id: string;
  style: FigureStyle;
  /** Tile background behind the figure (hex). */
  bg: string;
  /** Tile frame element: viewport source and TalkingHead's reference node for gaze. */
  el: HTMLElement;
}

export interface StageCue {
  /** Utterance id; a new key starts a new turn. */
  key: string | null;
  speaker: string | null;
  /** Seats that turn toward the speaker: addressees and the author of the answered turn. */
  listeners: string[];
  text: string;
  kind: string;
}

interface Seat {
  spec: SeatSpec;
  head: TalkingHead;
  camera: THREE.PerspectiveCamera;
  /** Where this figure looks when it faces another seat; moved on every turn. */
  gaze: THREE.Object3D;
  eyes: THREE.Vector3;
  /** Seat position in the on-screen grid (metres), the frame of reference for gaze. */
  grid: { x: number; y: number };
  bg: THREE.Color;
  rect: { x: number; y: number; w: number; h: number } | null;
  zoom: number;
  mouthOpen: boolean;
  frame: HeadFrame;
}

export interface SceneOptions {
  url: string;
  lang: "de" | "en";
  cols: number;
  live: { current: StageLive };
  onLost: (why: string) => void;
}

const VISEME_KEYS = VISEMES.map((v) => `viseme_${v}`);
const FOV = 20;
/** World spacing of seats. Figures stand side by side on one floor (TalkingHead plants the
 * feet at y = 0), far enough apart that no figure enters a neighbour's portrait. */
const SPACING = 2.5;

/** Visible height at the figure in metres for a tile aspect: chest up in near-square tiles,
 * head and shoulders in the wide, short tiles a long subtitle leaves. */
export function frameHeight(aspect: number): number {
  return Math.max(0.42, Math.min(0.7, 0.8 / Math.max(0.1, aspect)));
}

function toonGradient(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([90, 170, 235, 255]), 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Replace the source materials with flat toon colours (CON-1: stylized, never photographic). */
function restyle(root: THREE.Object3D, st: FigureStyle, grad: THREE.Texture) {
  const toon = (color: string, extra: THREE.MeshToonMaterialParameters = {}) =>
    new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: grad, ...extra });
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const name = (mat?.name ?? "").toLowerCase();
    if (name.includes("body")) m.material = toon(st.skin);
    else if (name.includes("casualsuit")) m.material = toon(st.suit);
    else if (name.includes("ponytail")) {
      if (!st.hair || st.hairCut !== "long") m.visible = false;
      else m.material = toon(st.hair, { side: THREE.DoubleSide });
    } else if (name.includes("eyebrows") || name.includes("eyelashes")) m.material = toon(st.brows);
    else if (name.includes("teeth")) m.material = toon("#efe9df");
    else if (name.includes("tongue")) m.material = toon("#b8676a");
    // eyes keep their small iris texture so the gaze stays readable
  });
}

function addGlasses(head: TalkingHead, grad: THREE.Texture) {
  const l = head.objectLeftEye.getWorldPosition(new THREE.Vector3());
  const r = head.objectRightEye.getWorldPosition(new THREE.Vector3());
  const mat = new THREE.MeshToonMaterial({ color: 0x23262b, gradientMap: grad });
  const g = new THREE.Group();
  const half = l.distanceTo(r) / 2;
  const ring = new THREE.TorusGeometry(half * 0.78, half * 0.09, 6, 20);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(ring, mat);
    m.position.set(s * half, 0, 0);
    g.add(m);
  }
  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(half * 0.07, half * 0.07, half * 0.5, 5),
    mat,
  );
  bridge.rotation.z = Math.PI / 2;
  g.add(bridge);
  g.position.copy(l).add(r).multiplyScalar(0.5);
  g.position.z += half * 0.75;
  head.objectHead.attach(g);
}

/** Shell over the skull: sphere cap proportions in units of half the eye distance. */
export interface HairShell {
  r: number;
  /** Polar extent from `from`, in units of pi. */
  theta: number;
  /** Polar start (pi units); above 0 the shell is a band, not a cap. */
  from: number;
  /** Width of the opening at the face (radians, 0 = closed). */
  face: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  y: number;
  z: number;
}

const shell = (p: Partial<HairShell>): HairShell => ({
  r: 3.05,
  theta: 0.66,
  from: 0,
  face: 0,
  sx: 1.05,
  sy: 0.88,
  sz: 1.12,
  rx: -0.75,
  y: 0.95,
  z: -1.7,
  ...p,
});

/**
 * Hair built at runtime, in toon colour like the rest of the figure. Seats cast as men get a
 * short cut (one cap, hairline lifted at the front) instead of the model's ponytail; seats cast
 * as women keep the ponytail and get a jaw-length fall at the back and sides, open at the face,
 * so the two read apart even in a small gallery tile.
 */
export const HAIR: Record<"short" | "long", HairShell[]> = {
  short: [shell({})],
  long: [
    shell({ r: 3.1, theta: 0.62, sx: 1.06, sy: 0.92, rx: -0.85, y: 1.0 }),
    shell({
      r: 3.15,
      theta: 0.42,
      from: 0.4,
      face: 2.3,
      sx: 1.08,
      sy: 1.5,
      sz: 1.08,
      rx: -0.1,
      y: -0.3,
      z: -1.6,
    }),
  ],
};

/** The head in its loading pose (upright, facing +z): the frame the hair is built in. */
interface HeadFrame {
  mid: THREE.Vector3;
  half: number;
  /** World to head-bone local, at loading time. */
  inv: THREE.Matrix4;
}

function headFrame(head: TalkingHead): HeadFrame {
  head.objectHead.updateWorldMatrix(true, false);
  const l = head.objectLeftEye.getWorldPosition(new THREE.Vector3());
  const r = head.objectRightEye.getWorldPosition(new THREE.Vector3());
  return {
    mid: l.clone().add(r).multiplyScalar(0.5),
    half: l.distanceTo(r) / 2,
    inv: head.objectHead.matrixWorld.clone().invert(),
  };
}

function addHair(
  head: TalkingHead,
  frame: HeadFrame,
  color: string,
  grad: THREE.Texture,
  shells: HairShell[],
) {
  const { half } = frame;
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.name = "stage-hair";
  for (const p of shells) {
    // the face opening is centred on +z (phi = pi/2 in three's sphere parametrisation)
    const phiStart = p.face ? Math.PI / 2 + p.face / 2 : 0;
    const phiLength = Math.PI * 2 - p.face;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(
        half * p.r,
        32,
        14,
        phiStart,
        phiLength,
        Math.PI * p.from,
        Math.PI * p.theta,
      ),
      mat,
    );
    m.scale.set(p.sx, p.sy, p.sz);
    m.rotation.x = p.rx;
    m.position.copy(frame.mid);
    m.position.y += half * p.y;
    m.position.z += half * p.z;
    group.add(m);
  }
  group.updateMatrix();
  group.applyMatrix4(frame.inv);
  head.objectHead.add(group);
}

export class AvatarScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly audioCtx: AudioContext | null;
  private readonly grad = toonGradient();
  private readonly lipsync: LipsyncProcessor;
  private readonly seats = new Map<string, Seat>();
  private readonly weights = Object.fromEntries(VISEMES.map((v) => [v, 0])) as Record<
    Viseme,
    number
  >;
  private cue: StageCue = { key: null, speaker: null, listeners: [], text: "", kind: "" };
  private track: VisemeTrack = { visemes: [], times: [], durations: [], total: 0 };
  private raf = 0;
  private last = 0;
  private disposed = false;
  private size = { w: 0, h: 0 };
  private gestureAt = 0;
  private slowFrames = 0;
  private frames = 0;
  private dpr: number;
  /** Frame time stats for the debug overlay and the adaptive resolution. */
  readonly stats = { fps: 0, dpr: 1 };

  private readonly canvas: HTMLCanvasElement;
  private readonly opts: SceneOptions;

  constructor(canvas: HTMLCanvasElement, opts: SceneOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d939e, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(1.2, 2.5, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.4);
    rim.position.set(-2.5, 1.5, -3);
    this.scene.add(rim);

    this.lipsync = opts.lang === "de" ? new LipsyncDe() : new LipsyncEn();
    // One shared context for all heads (TalkingHead builds its graph on it); nothing plays
    // through it, the stage's own audio element stays the only sound source.
    try {
      this.audioCtx = new AudioContext();
    } catch {
      this.audioCtx = null;
    }
    THREE.Cache.enabled = true; // the GLB is fetched once and parsed per seat
    if (process.env.NODE_ENV !== "production")
      (window as unknown as { __avatarScene?: AvatarScene }).__avatarScene = this;
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.opts.onLost("webglcontextlost");
  };

  /** Load one figure per seat, in order; seats appear as they finish. */
  async load(specs: SeatSpec[], onProgress: (done: number, total: number) => void) {
    let done = 0;
    for (const [i, spec] of specs.entries()) {
      if (this.disposed) return;
      const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 30);
      const head = new TalkingHead(spec.el, {
        avatarOnly: true,
        avatarOnlyScene: this.scene,
        avatarOnlyCamera: camera,
        audioCtx: this.audioCtx,
        lipsyncModules: [],
        lipsyncLang: this.opts.lang,
        avatarIdleEyeContact: 0.25,
        avatarIdleHeadMove: 0.45,
        avatarSpeakingEyeContact: 0.55,
        avatarSpeakingHeadMove: 0.6,
      });
      await head.showAvatar(
        {
          url: this.opts.url,
          body: spec.style.gender === "male" ? "M" : "F",
          lipsyncLang: this.opts.lang,
        },
        null,
        (gltf: GltfLike) => restyle(gltf.scene, spec.style, this.grad),
      );
      if (this.disposed) {
        head.dispose();
        return;
      }
      head.armature.position.set(i * SPACING, 0, 0);
      head.armature.scale.set(spec.style.width, spec.style.height, spec.style.width);
      head.armature.updateMatrixWorld(true);
      const frame = headFrame(head);
      if (spec.style.hair)
        addHair(head, frame, spec.style.hair, this.grad, HAIR[spec.style.hairCut]);
      if (spec.style.glasses) addGlasses(head, this.grad);
      const eyes = head.objectLeftEye
        .getWorldPosition(new THREE.Vector3())
        .add(head.objectRightEye.getWorldPosition(new THREE.Vector3()))
        .multiplyScalar(0.5);
      const gaze = new THREE.Object3D();
      gaze.position.copy(eyes).add(new THREE.Vector3(0, 0, 0.9));
      this.scene.add(gaze);
      const seat: Seat = {
        spec,
        head,
        camera,
        gaze,
        eyes,
        grid: seatPosition(i, this.opts.cols),
        bg: new THREE.Color(spec.bg),
        rect: null,
        zoom: 1,
        mouthOpen: false,
        frame,
      };
      this.seats.set(spec.id, seat);
      this.placeCamera(seat, 1);
      this.applyRects();
      done += 1;
      onProgress(done, specs.length);
      this.applyCue(true);
    }
  }

  /** Dev aid: rebuild the hair of every seat with other proportions (see HAIR). */
  tuneHair(cut: "short" | "long", shells: Partial<HairShell>[]) {
    HAIR[cut] = shells.map(shell);
    for (const seat of this.seats.values()) {
      const st = seat.spec.style;
      if (st.hairCut !== cut) continue;
      seat.head.objectHead.getObjectByName("stage-hair")?.removeFromParent();
      if (st.hair) addHair(seat.head, seat.frame, st.hair, this.grad, HAIR[cut]);
    }
  }

  private placeCamera(seat: Seat, zoom: number) {
    const fh = frameHeight(seat.camera.aspect);
    const dist = fh / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const e = seat.eyes;
    const cy = e.y - fh * 0.16;
    seat.camera.position.set(e.x, cy + 0.03, e.z + dist * zoom);
    seat.camera.lookAt(e.x, cy, e.z);
    seat.zoom = zoom;
  }

  /** Viewport of each tile, in CSS pixels relative to the canvas. */
  setRects(width: number, height: number, rects: Map<string, DOMRect>) {
    if (width !== this.size.w || height !== this.size.h) {
      this.size = { w: width, h: height };
      this.renderer.setSize(width, height, false);
    }
    this.rects = rects;
    this.applyRects();
  }
  private rects = new Map<string, DOMRect>();

  private applyRects() {
    for (const [id, r] of this.rects) {
      const seat = this.seats.get(id);
      if (!seat) continue;
      seat.rect = { x: r.x, y: this.size.h - r.y - r.height, w: r.width, h: r.height };
      seat.camera.aspect = r.width / Math.max(1, r.height);
      seat.camera.updateProjectionMatrix();
      this.placeCamera(seat, seat.zoom);
    }
  }

  setBackgrounds(bg: Map<string, string>) {
    for (const [id, c] of bg) this.seats.get(id)?.bg.set(c);
  }

  setCue(cue: StageCue) {
    const turn = cue.key !== this.cue.key;
    this.cue = cue;
    if (turn) this.track = buildTrack(cue.text, this.lipsync);
    this.applyCue(turn);
  }

  /** Gaze and gestures for the current turn. */
  private applyCue(turn: boolean) {
    const { speaker, listeners } = this.cue;
    const sp = speaker ? this.seats.get(speaker) : undefined;
    // Aim a figure's gaze at another seat's tile: the on-screen offset between the two seats,
    // in front of its own eyes, so it turns toward the tile it answers or listens to.
    const aim = (from: Seat, to: Seat) => {
      // clamped so a far seat reads as a three-quarter turn, not a profile
      const dx = Math.max(-0.9, Math.min(0.9, (to.grid.x - from.grid.x) * 0.6));
      const dy = Math.max(-0.5, Math.min(0.5, (to.grid.y - from.grid.y) * 0.6));
      from.gaze.position.set(from.eyes.x + dx, from.eyes.y + 0.12 + dy, from.eyes.z + 1);
      from.gaze.updateMatrixWorld();
      return from.gaze;
    };
    for (const [id, seat] of this.seats) {
      const head = seat.head;
      if (id === speaker) {
        const first = listeners.map((l) => this.seats.get(l)).find(Boolean);
        head.speakTo = first ? aim(seat, first) : null;
        if (turn) head.lookAtCamera(1800);
      } else if (sp && listeners.includes(id)) {
        head.speakTo = aim(seat, sp);
        head.lookAtCamera(5000);
      } else {
        head.speakTo = null;
      }
    }
    if (turn) this.gestureAt = performance.now() + 700;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(now: number) {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    const live = this.opts.live.current;
    const speaking = live.playing ? this.cue.speaker : null;

    // Gestures: one light gesture shortly into the turn, then occasional talking hands.
    if (speaking && now > this.gestureAt) {
      const head = this.seats.get(speaking)?.head;
      if (head) {
        if (this.gestureAt > 0 && Math.random() < 0.55) {
          const g =
            this.cue.kind === "rebuttal"
              ? "index"
              : this.cue.kind === "proposal"
                ? "side"
                : (["side", "shrug", "index"][Math.floor(Math.random() * 3)] ?? "side");
          head.playGesture(g, 2.2, Math.random() < 0.5, 800);
        } else head.speakWithHands(0, 0.6);
      }
      this.gestureAt = now + 2600 + Math.random() * 1800;
    }

    for (const [id, seat] of this.seats) {
      const head = seat.head;
      const talking = id === speaking;
      head.isSpeaking = talking;
      if (talking) {
        const w = visemeWeights(this.track, live.p, ampGate(live.amp), this.weights);
        VISEMES.forEach((v, i) => {
          const mt = head.mtAvatar[VISEME_KEYS[i] as string];
          if (!mt) return;
          mt.realtime = w[v];
          mt.needsUpdate = true;
        });
        seat.mouthOpen = true;
      } else if (seat.mouthOpen) {
        for (const k of VISEME_KEYS) {
          const mt = head.mtAvatar[k];
          if (!mt) continue;
          mt.realtime = null;
          mt.needsUpdate = true;
        }
        seat.mouthOpen = false;
      }
      // the active speaker's camera eases in a little
      const zoom = id === this.cue.speaker ? 0.86 : 1;
      if (Math.abs(seat.zoom - zoom) > 0.002)
        this.placeCamera(seat, seat.zoom + (zoom - seat.zoom) * Math.min(1, dt / 250));
      head.animate(dt);
    }
    this.render();
    this.adapt(dt);
  }

  private render() {
    const r = this.renderer;
    r.setScissorTest(false);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.setScissorTest(true);
    for (const seat of this.seats.values()) seat.head.armature.visible = false;
    for (const seat of this.seats.values()) {
      const v = seat.rect;
      if (!v || v.w < 2 || v.h < 2) continue;
      seat.head.armature.visible = true;
      r.setViewport(v.x, v.y, v.w, v.h);
      r.setScissor(v.x, v.y, v.w, v.h);
      r.setClearColor(seat.bg, 1);
      r.clear();
      r.render(this.scene, seat.camera);
      seat.head.armature.visible = false;
    }
  }

  /** Drop resolution step by step if the GPU cannot hold about 40 fps. */
  private adapt(dt: number) {
    this.frames += 1;
    this.stats.fps = this.stats.fps * 0.95 + (1000 / Math.max(1, dt)) * 0.05;
    this.stats.dpr = this.dpr;
    if (this.frames < 90) return;
    this.slowFrames = dt > 25 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 60 && this.dpr > 0.6) {
      this.dpr = Math.max(0.6, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.size.w, this.size.h, false);
      this.slowFrames = 0;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    for (const seat of this.seats.values()) {
      try {
        seat.head.dispose();
      } catch {
        // already torn down
      }
    }
    this.seats.clear();
    this.renderer.dispose();
    void this.audioCtx?.close().catch(() => {});
  }
}
