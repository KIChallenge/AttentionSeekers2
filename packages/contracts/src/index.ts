/**
 * @sv/contracts: the single source of truth for every entity that crosses a
 * boundary (engine, database, web UI, Python tracks via exported JSON Schema).
 *
 * File layout (stable; add new entities to the matching file, do not move them):
 *
 *   primitives.ts  IsoDate, Lang, AgentId, SpeakerId, UtteranceId, ModelId,
 *                  LocalizedText (+ localize), PayoffSign, Role, PhaseKey, PHASES
 *   evidence.ts    SourceKind, Institution, Source, Segment, CitationRef
 *   claims.ts      ClaimState, ModelVerdict, Claim
 *   traces.ts      Deliberation, Telemetry, PromptBlock, RetrievalTrace, UtteranceTrace
 *   utterance.ts   UtteranceKind, Utterance
 *   agents.ts      Topic, Axis, Position, StanceProfile, RedLine,
 *                  TemperamentSetting, Temperament, AgentConfig
 *   room.ts        Template, DecisionRule, Climate, PressureLevel, ScheduledEvent,
 *                  RoomAgent, RoomConfig                         (FR-U9, FR-U10)
 *   proposals.ts   OutcomeClass, RoundSummary, Proposal          (FR-M6, R3, R4, O2)
 *   strategy.ts    VetoStatus, IncentiveDimension, Incentive, StrategicAssessment (FR-A10),
 *                  Coalition, CoalitionCalculus (FR-A11), RoundLesson,
 *                  LessonApplication (FR-R8), lessonKey
 *   descriptor.ts  MeasureClass, OutcomeDescriptor (mirror of schema v0.1)
 *   outcome.ts     ImpactFigure, Forecast, RatificationVote, MethodNote
 *   run.ts         Mandate, RunVariant, EndCondition, Run, RunSummary
 *   llm-calls.ts   LlmCall, LlmCallParentKind, LlmCallStatus, MODEL_PRICES (estimates),
 *                  estimateCostUsd, providerOf, modelFamily, deriveLlmCalls (agent trace)
 *   events.ts      RunEvent (NDJSON protocol v1), parseNdjson, NdjsonBuffer
 *   snapshot.ts    RunSnapshot, emptySnapshot, reduceRun, foldRun, RunSequenceError,
 *                  positionAt, pathLength, topicStatus, summarizeRun
 *   catalog.ts     AGENT_CATALOG, CORE_AGENT_IDS, catalogAgent, TEMPLATES
 *
 * Conventions:
 * - Every schema `X` has a same-named inferred type `X`.
 * - Storage schemas may use .optional(); schemas sent to a model as strict JSON
 *   schema must use .nullable(), so LLM output schemas live in the engine and are
 *   mapped into these entities.
 * - No TS enums or namespaces (erasableSyntaxOnly). Imports use ".ts" suffixes.
 * - Never a person name in any text field (CON-1/CON-2).
 * - JSON Schema for the Python tracks: `pnpm contracts:schema` writes schema/*.json.
 *
 * Additive changes (all optional, never breaking):
 * - 2026-11-05 engine: Mandate.decisionRule, .budgetCeilingPct, .climate, .endConditions
 *   (rules restated in the mandate, FR-M1/M8/U10).
 * - 2026-11-05 engine: RoundSummary.recommendations (FR-O3, set on the final summary).
 * - 2026-11-05 engine: Proposal.votes (latest vote per agent with reason or condition),
 *   Proposal.capacityEffect, .measureClass, .financing, .components (impact model,
 *   forecast inputs, package contents).
 * - 2026-11-05 engine: Telemetry.reasoningTokens.
 * - 2026-11-06 agent trace: RunEvent "llm.call" (one per model call) and
 *   RunSnapshot.llmCalls; older runs fold to an empty list and use deriveLlmCalls.
 * - 2026-11-06 debate quality: Utterance.gate (turn gate decision), RunEvent
 *   "moderation.gate" and RunSnapshot.moderationGates, QualityReport for the audit file
 *   runs/<runId>.quality.json.
 * - 2026-11-06 compromise synthesis: CompromisePackage, CompromiseVote, CompromiseResult,
 *   RunEvents "compromise.proposed", "compromise.vote", "compromise.result", the optional
 *   RunSnapshot.compromise, .compromiseVotes, .compromiseResult; RoomConfig.pace.
 * - 2026-11-06 citation style: AgentConfig.citationStyle (optional).
 * - 2026-11-06 compromise consistency: CompromiseConsistency (sidecar runs/<id>.compromise.json).
 */
export * from "./agents.ts";
export * from "./catalog.ts";
export * from "./claims.ts";
export * from "./descriptor.ts";
export * from "./events.ts";
export * from "./evidence.ts";
export * from "./llm-calls.ts";
export * from "./outcome.ts";
export * from "./primitives.ts";
export * from "./proposals.ts";
export * from "./quality.ts";
export * from "./room.ts";
export * from "./run.ts";
export * from "./snapshot.ts";
export * from "./strategy.ts";
export * from "./traces.ts";
export * from "./utterance.ts";
