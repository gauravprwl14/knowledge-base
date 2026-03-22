-- CreateEnum
CREATE TYPE "ClearJobStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "kms_clear_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ClearJobStatus" NOT NULL DEFAULT 'RUNNING',
    "total_files" INTEGER NOT NULL DEFAULT 0,
    "files_cleared" INTEGER NOT NULL DEFAULT 0,
    "chunks_cleared" INTEGER NOT NULL DEFAULT 0,
    "vectors_cleared" INTEGER NOT NULL DEFAULT 0,
    "error_msg" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "kms_clear_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kms_clear_jobs_source_id_idx" ON "kms_clear_jobs"("source_id");

-- CreateIndex
CREATE INDEX "kms_clear_jobs_user_id_idx" ON "kms_clear_jobs"("user_id");
