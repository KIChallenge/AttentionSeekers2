// Pure helpers for the meeting view: live-caption chunks and the spotlight layout.

export interface CaptionChunk {
  text: string;
  /** Character offsets of the chunk in the utterance text. */
  start: number;
  end: number;
}

/** Longest caption chunk in characters: two lines at caption size on a 1920 wide projector. */
export const CAPTION_MAX = 130;

const ABBREV =
  /(?:^|[\s(])(?:\p{L}{1,2}|bzw|usw|vgl|etc|inkl|exkl|ggf|Abs|Art|Mio|Mrd|Prof|Abg|Nr)$/u;

/**
 * Splits an utterance into caption chunks: one sentence each, and sentences longer than `max`
 * cut again at the clause mark (comma, semicolon, colon, dash) nearest to the middle, else at
 * the space nearest to the middle. Offsets cover the whole text, so a playback position maps
 * to exactly one chunk.
 */
export function captionChunks(text: string, max = CAPTION_MAX): CaptionChunk[] {
  const out: CaptionChunk[] = [];
  // a sentence ends at . ! ? (also after a closing quote or bracket) followed by space
  const re = /[.!?…]+["'»«)\]]*\s+/g;
  let from = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    // "z. B." or "Nr. 5": a sentence does not end before a lower-case letter or a digit
    const next = text[end] ?? "";
    if (/[a-zäöüß0-9]/.test(next)) continue;
    // nor after a one or two letter token or a common abbreviation ("z.", "Abs.", "Mio.")
    if (m[0].startsWith(".") && ABBREV.test(text.slice(Math.max(from, m.index - 6), m.index)))
      continue;
    pushSplit(out, text, from, end, max);
    from = end;
  }
  if (from < text.length) pushSplit(out, text, from, text.length, max);
  return out.filter((c) => c.text.length > 0);
}

function pushSplit(out: CaptionChunk[], text: string, start: number, end: number, max: number) {
  const piece = text.slice(start, end);
  if (piece.trim().length <= max) {
    out.push({ text: piece.trim(), start, end });
    return;
  }
  const mid = start + piece.length / 2;
  let best = -1;
  for (const re of [/[,;:\u2013]\s/g, /\s/g]) {
    re.lastIndex = 0;
    for (let m = re.exec(piece); m; m = re.exec(piece)) {
      const cut = start + m.index + m[0].length;
      if (cut - start < 12 || end - cut < 12) continue;
      if (best < 0 || Math.abs(cut - mid) < Math.abs(best - mid)) best = cut;
    }
    // a clause mark well inside the middle third wins over a bare space
    if (best >= 0 && Math.abs(best - mid) < piece.length / 3) break;
  }
  if (best < 0) {
    out.push({ text: piece.trim(), start, end });
    return;
  }
  pushSplit(out, text, start, best, max);
  pushSplit(out, text, best, end, max);
}

/**
 * Index of the chunk being spoken at playback fraction `p` (0..1) of the utterance. The
 * fraction comes from audio currentTime / duration, or from text-length timing when silent;
 * mapping it onto character offsets weights every chunk by its length.
 */
export function chunkAt(chunks: readonly CaptionChunk[], p: number, textLength: number): number {
  if (chunks.length === 0) return -1;
  const pos = Math.max(0, Math.min(1, p)) * textLength;
  for (let i = 0; i < chunks.length; i++) {
    if (pos < (chunks[i]?.end ?? 0)) return i;
  }
  return chunks.length - 1;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Spotlight layout of a call: the active speaker large, everybody else in a gallery beside it
 * (landscape) or below it (portrait). Without an active speaker, an even gallery of all seats.
 * Seats keep their order in the gallery, so a figure only moves when it takes or leaves the
 * spotlight.
 */
export function meetingLayout(
  ids: readonly string[],
  active: string | null,
  width: number,
  height: number,
  gap = 12,
): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const spot = active && ids.includes(active) ? active : null;
  const others = spot ? ids.filter((id) => id !== spot) : [...ids];
  if (!spot) {
    grid(others, { x: 0, y: 0, w: W, h: H }, gap, out, 16 / 10);
    return out;
  }
  const landscape = W / H >= 1.15;
  if (landscape) {
    const share = others.length > 10 ? 0.34 : others.length > 6 ? 0.3 : 0.24;
    const gw = Math.round(W * share);
    out[spot] = { x: 0, y: 0, w: W - gw - gap, h: H };
    grid(others, { x: W - gw, y: 0, w: gw, h: H }, gap, out, 4 / 3);
  } else {
    const mh = Math.round(H * 0.55);
    out[spot] = { x: 0, y: 0, w: W, h: mh };
    grid(others, { x: 0, y: mh + gap, w: W, h: H - mh - gap }, gap, out, 4 / 3);
  }
  return out;
}

/** Even grid in `box`, columns chosen for the largest tiles near `aspect`, centred. */
function grid(
  ids: readonly string[],
  box: Rect,
  gap: number,
  out: Record<string, Rect>,
  aspect: number,
) {
  const n = ids.length;
  if (n === 0) return;
  let bestCols = 1;
  let bestArea = -1;
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c);
    const cw = (box.w - (c - 1) * gap) / c;
    const ch = (box.h - (rows - 1) * gap) / rows;
    // tiles wider than `aspect` waste width, taller ones waste height
    const w = Math.min(cw, ch * aspect * 1.25);
    const h = Math.min(ch, (cw / aspect) * 1.25);
    const area = w * h;
    if (area > bestArea) {
      bestArea = area;
      bestCols = c;
    }
  }
  const rows = Math.ceil(n / bestCols);
  const cw = (box.w - (bestCols - 1) * gap) / bestCols;
  const ch = (box.h - (rows - 1) * gap) / rows;
  const tw = Math.min(cw, ch * aspect * 1.25);
  const th = Math.min(ch, (cw / aspect) * 1.25);
  const usedH = rows * th + (rows - 1) * gap;
  const y0 = box.y + (box.h - usedH) / 2;
  ids.forEach((id, i) => {
    const r = Math.floor(i / bestCols);
    const c = i % bestCols;
    const inRow = Math.min(bestCols, n - r * bestCols);
    const usedW = inRow * tw + (inRow - 1) * gap;
    const x0 = box.x + (box.w - usedW) / 2;
    out[id] = {
      x: Math.round(x0 + c * (tw + gap)),
      y: Math.round(y0 + r * (th + gap)),
      w: Math.round(tw),
      h: Math.round(th),
    };
  });
}
