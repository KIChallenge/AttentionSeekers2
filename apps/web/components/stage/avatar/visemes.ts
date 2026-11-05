// Lip sync for the 3D stage, driven by the existing pre-rendered audio (FR-S3). The audio
// element stays the only clock: TalkingHead's rule-based German or English module turns the
// subtitle text into Oculus visemes on a relative time axis, the player's playback fraction
// picks the point on that axis, and the analyser amplitude gates the mouth so pauses close it.
// No word boundaries are needed; Azure SDK viseme events (FR-S6) would only sharpen timing.

export const VISEMES = [
  "aa",
  "E",
  "I",
  "O",
  "U",
  "PP",
  "SS",
  "TH",
  "DD",
  "FF",
  "kk",
  "nn",
  "RR",
  "CH",
  "sil",
] as const;
export type Viseme = (typeof VISEMES)[number];

export interface LipsyncProcessor {
  preProcessText(s: string): string;
  wordsToVisemes(w: string): { visemes: string[]; times: number[]; durations: number[] };
}

export interface VisemeTrack {
  visemes: Viseme[];
  times: number[];
  durations: number[];
  /** Length of the track in the processor's relative units. */
  total: number;
}

const KNOWN = new Set<string>(VISEMES);

export function buildTrack(text: string, proc: LipsyncProcessor): VisemeTrack {
  const empty: VisemeTrack = { visemes: [], times: [], durations: [], total: 0 };
  if (!text.trim()) return empty;
  let r: ReturnType<LipsyncProcessor["wordsToVisemes"]>;
  try {
    r = proc.wordsToVisemes(proc.preProcessText(text));
  } catch {
    return empty;
  }
  const out: VisemeTrack = { visemes: [], times: [], durations: [], total: 0 };
  r.visemes.forEach((v, i) => {
    const t = r.times[i];
    const d = r.durations[i];
    if (!KNOWN.has(v) || t === undefined || d === undefined) return;
    out.visemes.push(v as Viseme);
    out.times.push(t);
    out.durations.push(d);
    out.total = Math.max(out.total, t + d);
  });
  return out;
}

/** Audio lead-in and tail around the speech in the rendered files, as playback fractions. */
const LEAD = 0.015;
const TAIL = 0.04;

/**
 * Viseme weights at playback fraction `p` (0..1), scaled by `gate` (0..1, from amplitude).
 * Same envelope as TalkingHead's speakAudio: rise over two thirds of the viseme before its
 * onset, peak shortly after, release over half its length. Writes into `out` and returns it.
 */
export function visemeWeights(
  track: VisemeTrack,
  p: number,
  gate: number,
  out: Record<Viseme, number>,
): Record<Viseme, number> {
  for (const v of VISEMES) out[v] = 0;
  if (track.total <= 0 || gate <= 0) return out;
  const span = 1 - LEAD - TAIL;
  const x = ((p - LEAD) / span) * track.total;
  if (x < -1 || x > track.total + 1) return out;
  // first viseme that could still be active: binary search on onset time
  let lo = 0;
  let hi = track.times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((track.times[mid] ?? 0) < x - 2) lo = mid + 1;
    else hi = mid;
  }
  for (let i = Math.max(0, lo - 1); i < track.times.length; i++) {
    const t = track.times[i] ?? 0;
    if (t > x + 2) break;
    const d = track.durations[i] ?? 1;
    const v = track.visemes[i] as Viseme;
    const a = t - (2 * d) / 3;
    const b = t + d / 2;
    const c = t + d + d / 2;
    let w = 0;
    if (x > a && x <= b) w = (x - a) / (b - a);
    else if (x > b && x < c) w = (c - x) / (c - b);
    if (w <= 0) continue;
    const level = v === "PP" || v === "FF" ? 0.9 : 0.65;
    out[v] = Math.max(out[v], Math.min(1, w * level * gate));
  }
  return out;
}

/** Amplitude (analyser RMS, 0..1) to mouth gate: closed in pauses, full above normal speech. */
export function ampGate(amp: number): number {
  if (amp < 0.04) return 0;
  return Math.min(1, 0.35 + amp * 1.3);
}
