import type { Position, Run, RunSnapshot, Utterance } from "@sv/contracts";

// Pure helpers for the stage. The stage only reads the folded record (FR-S1); nothing here
// writes back or invents content.

/** Tile order: moderator first, then the run's institutions in config order, expert last. */
export function stageSpeakers(run: Run): string[] {
  return ["moderator", ...run.agents.map((a) => a.id), "expert"];
}

export function orderedUtterances(snap: RunSnapshot): Utterance[] {
  return snap.utteranceOrder
    .map((id) => snap.utterances[id])
    .filter((u): u is Utterance => u !== undefined);
}

export interface Exchange {
  /** The utterance being answered. */
  fromId: string;
  /** The rebuttal itself. */
  toId: string;
  /** Number of positions this rebuttal triggered. */
  shifts: number;
}

const AGENT_KINDS = new Set(["rebuttal", "position_shift", "proposal"]);

/**
 * FR-S8 default selection. Prefers an agent rebuttal that answers another utterance and is
 * recorded as the trigger of at least one position change (most changes wins, earliest on a
 * tie). Falls back to any answering agent utterance that triggered a change, then to the
 * first rebuttal in the record.
 */
export function pickSharpestExchange(snap: RunSnapshot): Exchange | null {
  const triggers = new Map<string, number>();
  for (const byTopic of Object.values(snap.positions)) {
    for (const list of Object.values(byTopic)) {
      for (const p of list) {
        if (p.trigger)
          triggers.set(p.trigger.utteranceId, (triggers.get(p.trigger.utteranceId) ?? 0) + 1);
      }
    }
  }
  const utts = orderedUtterances(snap).filter(
    (u) => u.respondsTo && snap.utterances[u.respondsTo] && u.speaker !== "moderator",
  );
  const score = (u: Utterance) => triggers.get(u.id) ?? 0;
  const best = (pool: Utterance[]) =>
    pool.reduce<Utterance | null>(
      (acc, u) => (acc === null || score(u) > score(acc) ? u : acc),
      null,
    );

  const rebuttals = utts.filter((u) => u.kind === "rebuttal");
  const pick =
    best(rebuttals.filter((u) => score(u) > 0)) ??
    best(utts.filter((u) => AGENT_KINDS.has(u.kind) && score(u) > 0)) ??
    rebuttals[0] ??
    null;
  if (!pick?.respondsTo) return null;
  return { fromId: pick.respondsTo, toId: pick.id, shifts: score(pick) };
}

export interface PositionShift {
  position: Position;
  previous: Position | null;
  triggerSeq: number;
}

/**
 * Latest recorded position change whose trigger was spoken at or before `uptoSeq`
 * (the record's own trigger link, FR-A5). Ties on the same trigger keep the larger move.
 */
export function latestShift(snap: RunSnapshot, uptoSeq: number): PositionShift | null {
  let out: PositionShift | null = null;
  for (const byTopic of Object.values(snap.positions)) {
    for (const list of Object.values(byTopic)) {
      list.forEach((p, i) => {
        if (!p.trigger) return;
        const trig = snap.utterances[p.trigger.utteranceId];
        if (!trig || trig.seq > uptoSeq) return;
        const previous = i > 0 ? (list[i - 1] ?? null) : null;
        const move = previous ? Math.abs(p.stance - previous.stance) : 0;
        const cand: PositionShift = { position: p, previous, triggerSeq: trig.seq };
        if (
          !out ||
          trig.seq > out.triggerSeq ||
          (trig.seq === out.triggerSeq &&
            move > (out.previous ? Math.abs(out.position.stance - out.previous.stance) : 0))
        ) {
          out = cand;
        }
      });
    }
  }
  return out;
}

/** Silent playback length: roughly 14 characters per second of speech, 2.5 s minimum. */
export function silentDurationMs(text: string): number {
  return Math.max(2500, Math.round((text.length / 14) * 1000)) + 400;
}

/**
 * Synthetic voice envelope for silent playback: syllable-rate pulses, closed on spaces and
 * punctuation so the mouth bar follows the words being read in the subtitles.
 */
export function syntheticAmplitude(text: string, progress: number, tMs: number): number {
  if (progress >= 1 || text.length === 0) return 0;
  const ch = text[Math.min(text.length - 1, Math.floor(progress * text.length))] ?? " ";
  if (/[.,;:!?]/.test(ch)) return 0.05;
  if (ch === " ") return 0.2;
  const syll = 0.5 + 0.5 * Math.sin((tMs / 1000) * 2 * Math.PI * 4.2);
  const jitter = 0.5 + 0.5 * Math.sin((tMs / 1000) * 2 * Math.PI * 1.3 + 1.7);
  return Math.min(1, 0.25 + 0.55 * syll + 0.2 * jitter);
}

export interface AudioManifest {
  runId: string;
  lang: string;
  model: string;
  voices: Record<string, string>;
  files: Record<string, string>;
  /** Voice provider of every file in `files` (absent: the provider in `model`, Azure so far). */
  provider?: AudioProvider;
  /** Attribution line the provider's terms require, shown in the audio chip tooltip. */
  attribution?: string;
}

export type AudioProvider = "azure" | "elevenlabs";

/** File name of the ElevenLabs variant next to the Azure file of the same utterance. */
export const EL_MANIFEST = "manifest.elevenlabs.json";

/**
 * Which file voices utterance `id`: the ElevenLabs variant where one was rendered, else the
 * Azure file, else none (silent playback). Both manifests share the utterance ids.
 */
export function audioFileFor(
  id: string,
  azure: AudioManifest | null,
  eleven: AudioManifest | null,
): { file: string; provider: AudioProvider } | null {
  const el = eleven?.files[id];
  if (el) return { file: el, provider: "elevenlabs" };
  const az = azure?.files[id];
  if (az) return { file: az, provider: azure?.provider ?? "azure" };
  return null;
}

/**
 * Contiguous span of utterance indices around the FR-S8 exchange whose characters fit
 * `budget`: the statement and the rebuttal first, then what lies between them (nearest to the
 * rebuttal first), then alternately the next utterance after and the one before, so the
 * showpiece the stage opens on is voiced end to end. Stops at the first neighbour that would
 * overflow, so the span stays contiguous. Returns [] if even the exchange does not fit.
 */
export function showpieceSpan(
  utts: readonly { id: string }[],
  exchange: { fromId: string; toId: string } | null,
  budget: number,
  charsOf: (i: number) => number,
): number[] {
  if (!exchange) return [];
  const from = utts.findIndex((u) => u.id === exchange.fromId);
  const to = utts.findIndex((u) => u.id === exchange.toId);
  if (from < 0 || to < 0) return [];
  let lo = Math.min(from, to);
  let hi = Math.max(from, to);
  let used = charsOf(from) + (to !== from ? charsOf(to) : 0);
  if (used > budget) return [];
  const picked = new Set([from, to]);
  // between statement and rebuttal: the stage plays both, the middle fills the "whole run" view
  for (let i = hi - 1; i > lo; i--) {
    if (used + charsOf(i) > budget) return [...picked].sort((a, b) => a - b);
    used += charsOf(i);
    picked.add(i);
  }
  let after = true;
  let blockedAfter = false;
  let blockedBefore = false;
  while (!(blockedAfter && blockedBefore)) {
    const i = after ? hi + 1 : lo - 1;
    const inRange = i >= 0 && i < utts.length;
    if (inRange && used + charsOf(i) <= budget) {
      used += charsOf(i);
      picked.add(i);
      if (after) hi = i;
      else lo = i;
    } else if (after) blockedAfter = true;
    else blockedBefore = true;
    if (!(after ? blockedBefore : blockedAfter)) after = !after;
  }
  return [...picked].sort((a, b) => a - b);
}
