CREATE TABLE "agent_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"run_id" text NOT NULL,
	"id" text NOT NULL,
	"utterance_id" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "claims_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "coalition_calculi" (
	"run_id" text NOT NULL,
	"round" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "coalition_calculi_run_id_round_pk" PRIMARY KEY("run_id","round")
);
--> statement-breakpoint
CREATE TABLE "method_notes" (
	"version" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcome_descriptors" (
	"case_id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"episode_id" text,
	"measure_class" text NOT NULL,
	"outcome" text,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"run_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"round" integer NOT NULL,
	"stance" real NOT NULL,
	"strength" real NOT NULL,
	"trigger_utterance_id" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "positions_run_id_agent_id_topic_id_round_pk" PRIMARY KEY("run_id","agent_id","topic_id","round")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"run_id" text NOT NULL,
	"id" text NOT NULL,
	"origin_agent" text NOT NULL,
	"status" text NOT NULL,
	"outcome_class" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "proposals_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "red_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"tier" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_lessons" (
	"run_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"round" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "round_lessons_run_id_agent_id_round_pk" PRIMARY KEY("run_id","agent_id","round")
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"t_ms" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "run_events_run_id_seq_pk" PRIMARY KEY("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"question" text NOT NULL,
	"template" text NOT NULL,
	"variant_kind" text NOT NULL,
	"base_run_id" text,
	"status" text NOT NULL,
	"is_reference" boolean DEFAULT false NOT NULL,
	"run" jsonb NOT NULL,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"text" text NOT NULL,
	"text_en" text,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('german', "text")) STORED,
	"embedding" vector(768)
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"institution_code" text NOT NULL,
	"institution_role" text NOT NULL,
	"date" date NOT NULL,
	"outlet" text,
	"title" text,
	"legal_ref" text,
	"url" text,
	"licence" text,
	"person_filtered" boolean NOT NULL,
	"corpus_revision" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stance_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"topic_key" text NOT NULL,
	"year" integer,
	"stance" real NOT NULL,
	"confidence" real NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_assessments" (
	"run_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"round" integer NOT NULL,
	"veto_status" text NOT NULL,
	"lean" text NOT NULL,
	"blockade_risk" real NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "strategic_assessments_run_id_agent_id_round_pk" PRIMARY KEY("run_id","agent_id","round")
);
--> statement-breakpoint
CREATE TABLE "utterance_traces" (
	"run_id" text NOT NULL,
	"utterance_id" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "utterance_traces_run_id_utterance_id_pk" PRIMARY KEY("run_id","utterance_id")
);
--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_events_type_idx" ON "run_events" USING btree ("run_id","type");--> statement-breakpoint
CREATE INDEX "runs_variant_idx" ON "runs" USING btree ("variant_kind");--> statement-breakpoint
CREATE INDEX "runs_created_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "segments_source_idx" ON "segments" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "segments_tsv_idx" ON "segments" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "segments_embedding_idx" ON "segments" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "sources_date_idx" ON "sources" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sources_role_idx" ON "sources" USING btree ("institution_role");--> statement-breakpoint
CREATE INDEX "stance_profiles_role_topic_idx" ON "stance_profiles" USING btree ("role","topic_key");