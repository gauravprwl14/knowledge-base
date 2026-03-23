-- Migration: 20260322000002_add_kms_voice_jobs
-- Adds kms_voice_jobs table and VoiceJobStatus enum for the
-- video transcription pipeline (Phase 2).

CREATE TYPE "VoiceJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

CREATE TABLE "kms_voice_jobs" (
    "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
    "file_id"          UUID          NOT NULL,
    "source_id"        UUID          NOT NULL,
    "user_id"          UUID          NOT NULL,
    "status"           "VoiceJobStatus" NOT NULL DEFAULT 'PENDING',
    "transcript"       TEXT,
    "language"         VARCHAR(10),
    "duration_seconds" DOUBLE PRECISION,
    "error_msg"        TEXT,
    "model_used"       VARCHAR(50),
    "started_at"       TIMESTAMP(3),
    "completed_at"     TIMESTAMP(3),
    "created_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "kms_voice_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kms_voice_jobs_file_id_idx"   ON "kms_voice_jobs"("file_id");
CREATE INDEX "kms_voice_jobs_user_id_idx"   ON "kms_voice_jobs"("user_id");
CREATE INDEX "kms_voice_jobs_status_idx"    ON "kms_voice_jobs"("status");

ALTER TABLE "kms_voice_jobs"
    ADD CONSTRAINT "kms_voice_jobs_file_id_fkey"
    FOREIGN KEY ("file_id")
    REFERENCES "kms_files"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
