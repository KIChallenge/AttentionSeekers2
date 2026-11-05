/**
 * @sv/db: Postgres 17 + pgvector via drizzle-orm/node-postgres.
 *   schema.ts     tables (evidence, agent configs, descriptors, runs, run_events, read models)
 *   client.ts     getDb(), closeDb()
 *   run-store.ts  appendRunEvents, readRunEvents, listRunSummaries, materializeRun, loadRun
 *   importers.ts  JSONL importers for the Python tracks (row-level Zod validation)
 */
export * from "./client.ts";
export * from "./importers.ts";
export * from "./run-store.ts";
export * as schema from "./schema.ts";
