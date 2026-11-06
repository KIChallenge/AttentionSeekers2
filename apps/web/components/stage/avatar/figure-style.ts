// Per-seat variation of the one generic figure (CON-1, FR-S7). Everything is derived from the
// speaker id, so a seat looks the same in every run and on every machine. Variation is coarse
// on purpose (clay tone, clothing in the institution colour, hair colour, build, glasses):
// enough to tell seats apart at a glance, never enough to read as a portrait. The presentation
// gender (body pose set, short cut or long hair) comes from lib/stage-cast.ts, the same table
// that picks the voices, so a seat never looks one way and sounds another.

import { type CastGender, castGender } from "@/lib/stage-cast";

export interface FigureStyle {
  /** Presentation gender from the cast (lib/stage-cast.ts); the voices use the same value. */
  gender: CastGender;
  /** Flat toon "clay" tone of skin, deliberately not a photographic skin texture. */
  skin: string;
  /** Hair colour, or null for no hair. */
  hair: string | null;
  /** Long hair tied back (the model's ponytail mesh) or a short cut built at runtime. */
  hairCut: "long" | "short";
  brows: string;
  /** Clothing colour: the institution colour (hex), darkened for the neutral seats. */
  suit: string;
  /** Uniform height factor and a width factor for build. */
  height: number;
  width: number;
  glasses: boolean;
  /** Realistic figures only: multiply on skin texels (white keeps the texture's own tone). */
  skinShift: string;
}

/** Figure style of the 3D stage: the stylized base figure (default) or realistic characters. */
export type FigureKind = "stylized" | "realistic";

export const isFigureKind = (v: string | null): v is FigureKind =>
  v === "stylized" || v === "realistic";

/**
 * Realistic characters (Microsoft Rocketbox, MIT, artist-made, see LICENSES.md), by cast
 * gender. Several per gender so neighbouring seats differ.
 */
export const REALISTIC_ASSETS: Record<CastGender, string[]> = {
  female: [
    "/avatars/realistic/female-a.glb",
    "/avatars/realistic/female-b.glb",
    "/avatars/realistic/female-c.glb",
  ],
  male: [
    "/avatars/realistic/male-a.glb",
    "/avatars/realistic/male-b.glb",
    "/avatars/realistic/male-c.glb",
  ],
};

/** Asset per seat: seats of one gender take the characters in turn, in seat order. */
export function realisticAssets(ids: string[]): Map<string, string> {
  const next: Record<CastGender, number> = { female: 0, male: 0 };
  const out = new Map<string, string>();
  for (const id of ids) {
    const g = castGender(id);
    const list = REALISTIC_ASSETS[g];
    out.set(id, list[next[g] % list.length] as string);
    next[g] += 1;
  }
  return out;
}

const SKIN_SHIFT = ["#ffffff", "#f6ede4", "#ece0d2", "#ddc9b5"];
/** Hair multiply: from the texture's own colour to darker and ashier tones. */
const HAIR_SHIFT = ["#ffffff", "#c8b7a6", "#8a7464", "#5a4c46", "#d8d4d0"];

const CLAY = ["#e0c3a8", "#c9a184", "#b48466", "#d6b59a", "#9c7258", "#e8d0bb"];
const HAIR: (string | null)[] = [
  "#2b2420",
  "#5b3c27",
  "#8f8a86",
  "#b8925a",
  null,
  "#3c3a44",
  "#6e4b33",
];

/** FNV-1a, stable across platforms. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(list: readonly T[], h: number, salt: number): T {
  return list[(((h >>> salt) ^ Math.imul(h, salt + 1)) >>> 0) % list.length] as T;
}

export function figureStyle(id: string, color: string): FigureStyle {
  const h = hashId(id);
  const gender = castGender(id);
  const picked = id === "moderator" ? "#3c3a44" : id === "expert" ? "#8f8a86" : pick(HAIR, h, 3);
  // long hair always has a colour; a short cut may be no hair at all
  const hair = gender === "female" ? (picked ?? "#5b3c27") : picked;
  const male = gender === "male";
  return {
    gender,
    skin: pick(CLAY, h, 7),
    hair,
    hairCut: male ? "short" : "long",
    brows: hair ?? "#4a3a30",
    suit: color,
    height: (male ? 0.99 : 0.95) + ((h >>> 11) % 6) / 100,
    width: (male ? 1.04 : 0.96) + ((h >>> 17) % 5) / 100,
    glasses: id === "expert" || (h >>> 23) % 4 === 0,
    skinShift: pick(SKIN_SHIFT, h, 5),
  };
}

/** Per-seat style of a realistic figure: same gender and clothing colour, texture tints. */
export function realisticStyle(id: string, color: string): FigureStyle {
  const h = hashId(id);
  return { ...figureStyle(id, color), hair: pick(HAIR_SHIFT, h, 13), glasses: false };
}

/** Grid columns for n seats; the same rule as the tile grid so both modes share a layout. */
export function stageColumns(n: number): number {
  return n <= 6 ? 3 : n <= 12 ? 4 : 5;
}

/** World position of seat i: the 3D grid mirrors the screen grid so gaze reads on screen. */
export function seatPosition(i: number, cols: number): { x: number; y: number } {
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: (col - (cols - 1) / 2) * 1.4, y: -row * 1.1 };
}
