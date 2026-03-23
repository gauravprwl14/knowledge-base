-- Add transcript_path column to kms_voice_jobs
-- transcript_path stores the MinIO object key (e.g. transcripts/{user_id}/{job_id}.txt)
-- The transcript TEXT column is kept for backward compatibility but will be deprecated

ALTER TABLE "kms_voice_jobs"
  ADD COLUMN IF NOT EXISTS "transcript_path" VARCHAR(512);

COMMENT ON COLUMN "kms_voice_jobs"."transcript_path" IS
  'MinIO object key for the transcript file. Format: transcripts/{user_id}/{job_id}.txt';
