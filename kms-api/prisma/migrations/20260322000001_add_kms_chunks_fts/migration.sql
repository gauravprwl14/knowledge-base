-- AlterTable kms_chunks: add source_id, search_vector (GIN FTS), start_secs
-- and change token_count to NOT NULL with default 0.
-- Backward-compatible: all new columns are nullable or have defaults.

-- Add source_id column (nullable initially to avoid breaking existing rows)
ALTER TABLE "kms_chunks" ADD COLUMN IF NOT EXISTS "source_id" UUID;

-- Add start_secs column for voice transcript timestamps
ALTER TABLE "kms_chunks" ADD COLUMN IF NOT EXISTS "start_secs" DOUBLE PRECISION;

-- Normalise token_count: drop nullable, add default 0
ALTER TABLE "kms_chunks" ALTER COLUMN "token_count" SET DEFAULT 0;
UPDATE "kms_chunks" SET "token_count" = 0 WHERE "token_count" IS NULL;
ALTER TABLE "kms_chunks" ALTER COLUMN "token_count" SET NOT NULL;

-- Add generated tsvector column for BM25 / PostgreSQL FTS
-- GENERATED ALWAYS AS ... STORED requires PostgreSQL 12+
ALTER TABLE "kms_chunks"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- CreateIndex for source_id lookups
CREATE INDEX IF NOT EXISTS "kms_chunks_source_id_idx" ON "kms_chunks"("source_id");

-- CreateIndex for GIN full-text search
CREATE INDEX IF NOT EXISTS "kms_chunks_search_vector_idx" ON "kms_chunks" USING GIN ("search_vector");
