import type {
  AgentConfig,
  Claim,
  CoalitionCalculus,
  Mandate,
  Position,
  Proposal,
  RoomConfig,
  RoundLesson,
  RoundSummary,
  Run,
  StrategicAssessment,
  Utterance,
} from "@sv/contracts";
import type { Vote } from "./coalition.ts";
import type { Passage } from "./retrieval.ts";

export interface VoteRecord {
  vote: Vote;
  reason: string;
  round: number;
}

export interface RunState {
  run: Run;
  room: RoomConfig;
  mandate: Mandate;
  agents: AgentConfig[];
  agentIds: string[];
  utterances: Utterance[];
  claims: Map<string, Claim>;
  /** Latest position per agent and topic. */
  positions: Map<string, Map<string, Position>>;
  proposals: Map<string, Proposal>;
  /** votes[proposalId][agentId] */
  votes: Map<string, Map<string, VoteRecord>>;
  /** Latest lesson per agent. */
  lessons: Map<string, RoundLesson>;
  assessments: Map<string, StrategicAssessment>;
  calculus: CoalitionCalculus | null;
  summaries: RoundSummary[];
  /** Pending moderator justification demands per agent (FR-M4). */
  demands: Map<string, { utteranceId: string; claim: string }>;
  /** Evidence passages seen per agent, keyed by segment id (for citation lookups). */
  passages: Map<string, Passage>;
  /** Rounds in which the tabled proposal was blocked, per proposal. */
  blockedRounds: Map<string, number>;
  proposalCounter: number;
  uttCounter: number;
  /** Fork edits (FR-K) applied to retrieval. */
  retrievalEdit: { agentId: string; remove: string[]; add: string[] } | null;
}

export function lastUtteranceOf(s: RunState, agentId: string): Utterance | undefined {
  for (let i = s.utterances.length - 1; i >= 0; i--) {
    const u = s.utterances[i];
    if (u && u.speaker === agentId) return u;
  }
  return undefined;
}
