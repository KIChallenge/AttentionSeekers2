import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

// Tables mirror @sv/contracts. Key columns are typed for filtering and group-bys;
// the full validated entity lives in `data` (jsonb) so contract additions need no
// migration. run_events is canonical (NFR-5); the rest of the run tables are read
// models materialised at run.completed.

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const EMBEDDING_DIMENSIONS = 768;

// ---------- evidence (imported from the data track) ----------

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    institutionCode: text("institution_code").notNull(),
    institutionRole: text("institution_role").notNull(),
    date: date("date").notNull(),
    outlet: text("outlet"),
    title: text("title"),
    legalRef: text("legal_ref"),
    url: text("url"),
    licence: text("licence"),
    personFiltered: boolean("person_filtered").notNull(),
    corpusRevision: text("corpus_revision").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [index("sources_date_idx").on(t.date), index("sources_role_idx").on(t.institutionRole)],
);

export const segments = pgTable(
  "segments",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    start: integer("start").notNull(),
    end: integer("end").notNull(),
    text: text("text").notNull(),
    textEn: text("text_en"),
    /** Lexical branch: built-in FTS with the german config (replaces ParadeDB BM25). */
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('german', "text")`),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [
    index("segments_source_idx").on(t.sourceId),
    index("segments_tsv_idx").using("gin", t.tsv),
    index("segments_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

/**
 * Semantic branch: one row per (segment, embedding model), kept apart from
 * segments.embedding (768-dim, never filled) so the change stays additive for the
 * running app. text_hash lets the embed job skip unchanged segments and redo edited ones.
 */
export const SEMANTIC_DIMENSIONS = 1024;

export const segmentEmbeddings = pgTable(
  "segment_embeddings",
  {
    segmentId: text("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    textHash: text("text_hash").notNull(),
    tokens: integer("tokens"),
    embedding: vector("embedding", { dimensions: SEMANTIC_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.segmentId, t.model] }),
    index("segment_embeddings_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const stanceProfiles = pgTable(
  "stance_profiles",
  {
    id: serial("id").primaryKey(),
    role: text("role").notNull(),
    topicKey: text("topic_key").notNull(),
    year: integer("year"),
    stance: real("stance").notNull(),
    confidence: real("confidence").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [index("stance_profiles_role_topic_idx").on(t.role, t.topicKey)],
);

export const redLines = pgTable("red_lines", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  tier: text("tier").notNull(),
  data: jsonb("data").notNull(),
});

export const agentConfigs = pgTable("agent_configs", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outcomeDescriptors = pgTable("outcome_descriptors", {
  caseId: text("case_id").primaryKey(),
  origin: text("origin").notNull(),
  episodeId: text("episode_id"),
  measureClass: text("measure_class").notNull(),
  outcome: text("outcome"),
  data: jsonb("data").notNull(),
});

export const methodNotes = pgTable("method_notes", {
  version: text("version").primaryKey(),
  data: jsonb("data").notNull(),
});

// ---------- runs ----------

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    question: text("question").notNull(),
    template: text("template").notNull(),
    variantKind: text("variant_kind").notNull(),
    baseRunId: text("base_run_id"),
    status: text("status").notNull(),
    isReference: boolean("is_reference").notNull().default(false),
    /** Run entity from run.started. */
    run: jsonb("run").notNull(),
    /** RunSummary, refreshed at run.completed. */
    summary: jsonb("summary"),
  },
  (t) => [index("runs_variant_idx").on(t.variantKind), index("runs_created_idx").on(t.createdAt)],
);

export const runEvents = pgTable(
  "run_events",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    tMs: integer("t_ms").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.seq] }),
    index("run_events_type_idx").on(t.runId, t.type),
  ],
);

export const positions = pgTable(
  "positions",
  {
    runId: text("run_id").notNull(),
    agentId: text("agent_id").notNull(),
    topicId: text("topic_id").notNull(),
    round: integer("round").notNull(),
    stance: real("stance").notNull(),
    strength: real("strength").notNull(),
    triggerUtteranceId: text("trigger_utterance_id"),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.agentId, t.topicId, t.round] })],
);

export const claims = pgTable(
  "claims",
  {
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    utteranceId: text("utterance_id").notNull(),
    kind: text("kind").notNull(),
    state: text("state").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] })],
);

export const proposals = pgTable(
  "proposals",
  {
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    originAgent: text("origin_agent").notNull(),
    status: text("status").notNull(),
    outcomeClass: text("outcome_class"),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] })],
);

export const utteranceTraces = pgTable(
  "utterance_traces",
  {
    runId: text("run_id").notNull(),
    utteranceId: text("utterance_id").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.utteranceId] })],
);

export const strategicAssessments = pgTable(
  "strategic_assessments",
  {
    runId: text("run_id").notNull(),
    agentId: text("agent_id").notNull(),
    round: integer("round").notNull(),
    vetoStatus: text("veto_status").notNull(),
    lean: text("lean").notNull(),
    blockadeRisk: real("blockade_risk").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.agentId, t.round] })],
);

export const coalitionCalculi = pgTable(
  "coalition_calculi",
  {
    runId: text("run_id").notNull(),
    round: integer("round").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.round] })],
);

export const roundLessons = pgTable(
  "round_lessons",
  {
    runId: text("run_id").notNull(),
    agentId: text("agent_id").notNull(),
    round: integer("round").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.agentId, t.round] })],
);
