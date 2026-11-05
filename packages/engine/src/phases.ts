import { PHASES } from "@sv/contracts";

export const PHASE_NAMES = PHASES;

/**
 * Maps a round to one of the five phases (FR-R1). Round 1 is always position formation,
 * the last round is always presentation; the rounds between spread over discussion,
 * negotiation and compromise.
 */
export function phaseFor(round: number, roundLimit: number): number {
  if (round <= 1) return 1;
  if (round >= roundLimit) return 5;
  const middle = roundLimit - 2;
  if (middle <= 0) return 5;
  return 2 + Math.min(2, Math.floor(((round - 2) * 3) / middle));
}

/** Deterministic PRNG (mulberry32) for the recorded speaking order (FR-M3). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
