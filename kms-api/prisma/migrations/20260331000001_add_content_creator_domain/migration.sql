-- Migration: Add Content Creator Domain (M17)
-- ADR: docs/architecture/decisions/0034-content-creator-kms-integration.md
-- Date: 2026-03-31
-- IMPORTANT: ALTER TYPE ADD VALUE is non-blocking on PostgreSQL 12+ outside transactions.
-- Prisma wraps migrations in a transaction by default — test on populated DB first.

-- Step 1: Extend SourceType enum with new source types
-- NOTE: PostgreSQL does not allow ALTER TYPE ADD VALUE inside a transaction.
-- Prisma runs migrations in transactions, so we use a workaround: commit the
-- transaction before adding enum values, then continue.
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'YOUTUBE';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'URL';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'DOCUMENT';

-- Step 2: Create ContentSourceType enum
CREATE TYPE "ContentSourceType" AS ENUM (
    'YOUTUBE',
    'URL',
    'VIDEO',
    'DOCUMENT',
    'KMS_FILE'
);

-- Step 3: Create ContentJobStatus enum
CREATE TYPE "ContentJobStatus" AS ENUM (
    'QUEUED',
    'INGESTING',
    'EXTRACTING',
    'GENERATING',
    'DONE',
    'FAILED',
    'CANCELLED'
);

-- Step 4: Create content_jobs table
CREATE TABLE "content_jobs" (
    "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"          UUID        NOT NULL,
    "source_type"      "ContentSourceType" NOT NULL,
    "source_url"       TEXT,
    "source_file_id"   UUID,
    "title"            VARCHAR(512),
    "status"           "ContentJobStatus" NOT NULL DEFAULT 'QUEUED',
    "steps_json"       JSONB       NOT NULL DEFAULT '{}',
    "config_snapshot"  JSONB       NOT NULL DEFAULT '{}',
    "error_message"    TEXT,
    "transcript_text"  TEXT,
    "concepts_text"    TEXT,
    "voice_brief_text" TEXT,
    "tags"             TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    "completed_at"     TIMESTAMPTZ,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "content_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_jobs_user_id_idx"         ON "content_jobs" ("user_id");
CREATE INDEX "content_jobs_status_idx"           ON "content_jobs" ("status");
CREATE INDEX "content_jobs_user_id_status_idx"   ON "content_jobs" ("user_id", "status");
CREATE INDEX "content_jobs_user_id_created_idx"  ON "content_jobs" ("user_id", "created_at" DESC);

ALTER TABLE "content_jobs"
    ADD CONSTRAINT "content_jobs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

-- Step 5: Create content_pieces table
CREATE TABLE "content_pieces" (
    "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
    "job_id"          UUID        NOT NULL,
    "user_id"         UUID        NOT NULL,
    "platform"        VARCHAR(50) NOT NULL,
    "format"          VARCHAR(50) NOT NULL,
    "variation_index" INT         NOT NULL DEFAULT 0,
    "content"         TEXT        NOT NULL,
    "status"          VARCHAR(20) NOT NULL DEFAULT 'draft',
    "is_active"       BOOLEAN     NOT NULL DEFAULT TRUE,
    "version"         INT         NOT NULL DEFAULT 1,
    "metadata"        JSONB       DEFAULT '{}',
    "edited_at"       TIMESTAMPTZ,
    "published_at"    TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "content_pieces_pkey" PRIMARY KEY ("id")
);

-- Idempotency constraint: worker uses INSERT ... ON CONFLICT DO NOTHING
CREATE UNIQUE INDEX "content_pieces_job_platform_format_variation_uidx"
    ON "content_pieces" ("job_id", "platform", "format", "variation_index");

CREATE INDEX "content_pieces_job_id_idx"              ON "content_pieces" ("job_id");
CREATE INDEX "content_pieces_job_id_platform_idx"     ON "content_pieces" ("job_id", "platform");
CREATE INDEX "content_pieces_job_id_platform_active_idx"
    ON "content_pieces" ("job_id", "platform", "is_active");
CREATE INDEX "content_pieces_user_id_idx"             ON "content_pieces" ("user_id");

ALTER TABLE "content_pieces"
    ADD CONSTRAINT "content_pieces_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "content_jobs" ("id") ON DELETE CASCADE;

-- Step 6: Create content_configurations table
CREATE TABLE "content_configurations" (
    "id"                        UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"                   UUID        NOT NULL,
    "platform_config"           JSONB       NOT NULL DEFAULT '{}',
    "voice_mode"                VARCHAR(20) NOT NULL DEFAULT 'auto',
    "hashnode_api_key_encrypted" TEXT,
    "created_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "content_configurations_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "content_configurations_user_id_key" UNIQUE ("user_id")
);

ALTER TABLE "content_configurations"
    ADD CONSTRAINT "content_configurations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

-- Step 7: Create creator_voice_profiles table
CREATE TABLE "creator_voice_profiles" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"      UUID        NOT NULL,
    "profile_text" TEXT        NOT NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "creator_voice_profiles_pkey"         PRIMARY KEY ("id"),
    CONSTRAINT "creator_voice_profiles_user_id_key"  UNIQUE ("user_id")
);

ALTER TABLE "creator_voice_profiles"
    ADD CONSTRAINT "creator_voice_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

-- Step 8: Create content_chat_messages table
CREATE TABLE "content_chat_messages" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "job_id"     UUID        NOT NULL,
    "piece_id"   UUID,
    "user_id"    UUID        NOT NULL,
    "role"       VARCHAR(20) NOT NULL,
    "content"    TEXT        NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "content_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_chat_messages_job_id_idx"          ON "content_chat_messages" ("job_id");
CREATE INDEX "content_chat_messages_piece_id_idx"        ON "content_chat_messages" ("piece_id");
CREATE INDEX "content_chat_messages_job_id_created_idx"  ON "content_chat_messages" ("job_id", "created_at");

ALTER TABLE "content_chat_messages"
    ADD CONSTRAINT "content_chat_messages_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "content_jobs" ("id") ON DELETE CASCADE;

ALTER TABLE "content_chat_messages"
    ADD CONSTRAINT "content_chat_messages_piece_id_fkey"
    FOREIGN KEY ("piece_id") REFERENCES "content_pieces" ("id") ON DELETE SET NULL;
