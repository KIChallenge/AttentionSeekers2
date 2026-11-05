/**
 * @sv/engine: negotiation engine (moderator, institutional agents, Experte, coalition
 * calculus, impact model, forecasting bridge). Emits RunEvents (@sv/contracts).
 *   llm.ts        gateway client, structured() with strict JSON schema
 *   room.ts       question + RoomConfig to Mandate (FR-M1, M2)
 *   agent.ts      turns, strategic assessments, lessons (FR-A3..A5, A10, R8, T1)
 *   coalition.ts  pure coalition calculus (FR-A11)
 *   expert.ts     claim checks with two verifier calls (FR-N1, N2, N7)
 *   moderator.ts  round summaries, conflicts first (FR-M6, M7)
 *   impact.ts     deterministic impact model (FR-N3..N6)
 *   forecast.ts   SV_FORECAST_CMD bridge
 *   guard.ts      CON-1/CON-2 person-name guard
 *   runner.ts     the loop; writer.ts the event writer
 */
export * from "./coalition.ts";
export * from "./guard.ts";
export * from "./impact.ts";
export * from "./phases.ts";
export { HALF_LIFE_YEARS, isEligible, recencyWeight } from "./retrieval.ts";
export { buildMandate, defaultRoom } from "./room.ts";
export { newRunId, runNegotiation } from "./runner.ts";
