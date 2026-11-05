import { z } from "zod";
import { Position } from "./agents.ts";
import { Claim } from "./claims.ts";
import { Forecast, ImpactFigure, RatificationVote } from "./outcome.ts";
import { AgentId, Lang, LocalizedText, ModelId, SpeakerId, UtteranceId } from "./primitives.ts";
import { Proposal, RoundSummary } from "./proposals.ts";
import { ScheduledEvent } from "./room.ts";
import { EndCondition, Run } from "./run.ts";
import {
  CoalitionCalculus,
  LessonApplication,
  RoundLesson,
  StrategicAssessment,
} from "./strategy.ts";
import { UtteranceTrace } from "./traces.ts";
import { Exchange, Utterance } from "./utterance.ts";

// RunEvent NDJSON protocol (ui-plan 4.2). One JSON object per line.
// Rules: seq starts at 0 with run.started and is strictly increasing per run;
// tMs is milliseconds since run start; replay re-emits lines unchanged except
// run.started.source = "replay".

export const PROTOCOL_VERSION = 1 as const;

const Envelope = {
  v: z.literal(PROTOCOL_VERSION),
  runId: z.string(),
  seq: z.number().int().nonnegative(),
  tMs: z.number().int().nonnegative(),
};

export const RunEvent = z.discriminatedUnion("type", [
  z.object({
    ...Envelope,
    type: z.literal("run.started"),
    run: Run,
    source: z.enum(["live", "replay"]),
  }),
  z.object({
    ...Envelope,
    type: z.literal("round.started"),
    round: z.number().int(),
    phase: z.number().int().min(1).max(5),
    speakingOrder: z.array(AgentId),
  }),
  z.object({
    ...Envelope,
    type: z.literal("room.event_injected"),
    round: z.number().int(),
    event: ScheduledEvent,
  }),
  z.object({
    ...Envelope,
    type: z.literal("utterance.started"),
    utteranceId: UtteranceId,
    speaker: SpeakerId,
    round: z.number().int(),
    respondsTo: UtteranceId.nullable(),
    model: ModelId,
  }),
  z.object({
    ...Envelope,
    type: z.literal("utterance.delta"),
    utteranceId: UtteranceId,
    text: z.string(),
  }),
  z.object({
    ...Envelope,
    type: z.literal("utterance.completed"),
    utterance: Utterance,
    claims: z.array(Claim),
  }),
  z.object({ ...Envelope, type: z.literal("utterance.trace"), trace: UtteranceTrace }),
  z.object({ ...Envelope, type: z.literal("claim.updated"), claim: Claim }),
  z.object({
    ...Envelope,
    type: z.literal("expert.note"),
    utteranceIds: z.array(UtteranceId),
    note: LocalizedText,
    resolution: z.enum(["unresolved", "resolved"]),
  }),
  z.object({ ...Envelope, type: z.literal("position.updated"), position: Position }),
  z.object({ ...Envelope, type: z.literal("proposal.updated"), proposal: Proposal }),
  z.object({ ...Envelope, type: z.literal("strategy.assessed"), assessment: StrategicAssessment }),
  z.object({ ...Envelope, type: z.literal("coalition.computed"), calculus: CoalitionCalculus }),
  z.object({ ...Envelope, type: z.literal("round.summary"), summary: RoundSummary }),
  z.object({ ...Envelope, type: z.literal("lesson.recorded"), lesson: RoundLesson }),
  z.object({ ...Envelope, type: z.literal("exchange.opened"), exchange: Exchange }),
  z.object({ ...Envelope, type: z.literal("exchange.closed"), exchange: Exchange }),
  z.object({ ...Envelope, type: z.literal("lesson.applied"), application: LessonApplication }),
  z.object({
    ...Envelope,
    type: z.literal("agent.degraded"),
    agentId: AgentId,
    utteranceId: UtteranceId.nullable(),
    reason: z.string(),
  }),
  z.object({
    ...Envelope,
    type: z.literal("translation.ready"),
    utteranceIds: z.array(UtteranceId),
    lang: Lang,
    texts: z.record(z.string(), z.string()),
  }),
  z.object({ ...Envelope, type: z.literal("impact.computed"), figures: z.array(ImpactFigure) }),
  z.object({
    ...Envelope,
    type: z.literal("forecast.computed"),
    forecasts: z.array(Forecast),
    extractorVersion: z.string(),
  }),
  z.object({ ...Envelope, type: z.literal("ratification.vote"), vote: RatificationVote }),
  z.object({ ...Envelope, type: z.literal("run.completed"), endCondition: EndCondition }),
  z.object({
    ...Envelope,
    type: z.literal("run.error"),
    message: z.string(),
    retryable: z.boolean(),
  }),
  z.object({ ...Envelope, type: z.literal("heartbeat") }),
]);
export type RunEvent = z.infer<typeof RunEvent>;
export type RunEventType = RunEvent["type"];
export type RunEventOf<T extends RunEventType> = Extract<RunEvent, { type: T }>;

/** Parses NDJSON text into validated events; throws with the 1-based line number. */
export function parseNdjson(text: string): RunEvent[] {
  const out: RunEvent[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const parsed = RunEvent.safeParse(JSON.parse(line));
    if (!parsed.success) {
      throw new Error(`RunEvent line ${i + 1}: ${parsed.error.message}`);
    }
    out.push(parsed.data);
  }
  return out;
}

/** Incremental NDJSON line splitter for streamed responses (from medlyn lens-state). */
export class NdjsonBuffer {
  private buffer = "";
  push(chunk: string, final = false): unknown[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = final ? "" : (lines.pop() ?? "");
    return lines.filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
}
