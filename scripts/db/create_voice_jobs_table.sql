-- DDL for the voice_jobs table used by the voice-app transcription service.
-- Run this once against the KMS PostgreSQL database (or include in the main init.sql).

CREATE TABLE IF NOT EXISTS voice_jobs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL,
    source_id         UUID,
    file_path         TEXT        NOT NULL,
    original_filename TEXT        NOT NULL,
    mime_type         TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING | PROCESSING | COMPLETED | FAILED
    transcript        TEXT,
    language          TEXT,
    duration_seconds  FLOAT,
    error_msg         TEXT,
    model_used        TEXT        NOT NULL DEFAULT 'base',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_voice_jobs_user_id    ON voice_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_voice_jobs_status     ON voice_jobs (status);
CREATE INDEX IF NOT EXISTS idx_voice_jobs_created_at ON voice_jobs (created_at DESC);

-- Composite index for the consumer's PENDING poll query
CREATE INDEX IF NOT EXISTS idx_voice_jobs_pending_created
    ON voice_jobs (created_at ASC)
    WHERE status = 'PENDING';
