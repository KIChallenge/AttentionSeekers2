CREATE TABLE "segment_embeddings" (
	"segment_id" text NOT NULL,
	"model" text NOT NULL,
	"text_hash" text NOT NULL,
	"tokens" integer,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "segment_embeddings_segment_id_model_pk" PRIMARY KEY("segment_id","model")
);
--> statement-breakpoint
ALTER TABLE "segment_embeddings" ADD CONSTRAINT "segment_embeddings_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "segment_embeddings_hnsw_idx" ON "segment_embeddings" USING hnsw ("embedding" vector_cosine_ops);