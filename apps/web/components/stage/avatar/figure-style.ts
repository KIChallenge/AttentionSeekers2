// Per-seat variation of the one generic figure (CON-1, FR-S7). Everything is derived from the
// speaker id, so a seat looks the same in every run and on every machine. Variation is coarse
// on purpose (clay tone, clothing in the institution colour, hair colour or none, build,
// glasses): enough to tell seats apart at a glance, never enough to read as a portrait.

export interface FigureStyle {
  /** Flat toon "clay" tone of skin, deliberately not a photographic skin texture. */
  skin: string;
  /** Hair colour, or null for no hair mesh. */
  hair: string | null;
  brows: string;
  /** Clothing colour: the institution colour (hex), darkened for the neutral seats. */
  suit: string;
  /** Uniform height factor and a width factor for build. */
  height: number;
  width: number;
  glasses: boolean;
}

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
  const hair = id === "moderator" ? "#3c3a44" : id === "expert" ? "#8f8a86" : pick(HAIR, h, 3);
  return {
    skin: pick(CLAY, h, 7),
    hair,
    brows: hair ?? "#4a3a30",
    suit: color,
    height: 0.96 + ((h >>> 11) % 9) / 100,
    width: 0.97 + ((h >>> 17) % 8) / 100,
    glasses: id === "expert" || (h >>> 23) % 4 === 0,
  };
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
