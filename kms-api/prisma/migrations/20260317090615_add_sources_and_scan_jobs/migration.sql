-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('LOCAL', 'GOOGLE_DRIVE', 'OBSIDIAN');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('PENDING', 'IDLE', 'CONNECTED', 'SCANNING', 'COMPLETED', 'EXPIRED', 'ERROR', 'DISCONNECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "ScanJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScanJobType" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'PROCESSING', 'INDEXED', 'ERROR');

-- CreateEnum
CREATE TYPE "JunkStatus" AS ENUM ('FLAGGED', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DedupStrategy" AS ENUM ('EXACT', 'SEMANTIC', 'VERSION');

-- CreateEnum
CREATE TYPE "DedupGroupStatus" AS ENUM ('UNRESOLVED', 'RESOLVED');

-- CreateTable
CREATE TABLE "kms_sources" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "SourceType" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "name" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "encrypted_tokens" TEXT,
    "external_id" VARCHAR(255),
    "metadata" JSONB,
    "status" "SourceStatus" NOT NULL DEFAULT 'PENDING',
    "last_scanned_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kms_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_scan_jobs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ScanJobStatus" NOT NULL DEFAULT 'QUEUED',
    "type" "ScanJobType" NOT NULL DEFAULT 'FULL',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "files_discovered" INTEGER NOT NULL DEFAULT 0,
    "files_found" INTEGER NOT NULL DEFAULT 0,
    "files_added" INTEGER NOT NULL DEFAULT 0,
    "files_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kms_scan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_files" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "path" TEXT NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" VARCHAR(64),
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "junk_status" "JunkStatus",
    "junk_reason" VARCHAR(50),
    "junk_confidence" DOUBLE PRECISION,
    "junk_reviewed_at" TIMESTAMP(3),
    "indexed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kms_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_chunks" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "token_count" INTEGER,
    "qdrant_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kms_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_duplicate_groups" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "strategy" "DedupStrategy" NOT NULL,
    "file_count" INTEGER NOT NULL,
    "total_size_bytes" BIGINT,
    "status" "DedupGroupStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kms_duplicate_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_file_duplicates" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "is_canonical" BOOLEAN NOT NULL DEFAULT false,
    "similarity_score" DOUBLE PRECISION,

    CONSTRAINT "kms_file_duplicates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_transcription_links" (
    "id" UUID NOT NULL,
    "kms_file_id" UUID NOT NULL,
    "voice_transcription_id" UUID NOT NULL,
    "provider" VARCHAR(30),
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kms_transcription_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_chat_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kms_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "citations_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kms_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_collections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kms_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kms_collection_files" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kms_collection_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kms_sources_user_id_idx" ON "kms_sources"("user_id");

-- CreateIndex
CREATE INDEX "kms_sources_user_id_status_idx" ON "kms_sources"("user_id", "status");

-- CreateIndex
CREATE INDEX "kms_scan_jobs_source_id_idx" ON "kms_scan_jobs"("source_id");

-- CreateIndex
CREATE INDEX "kms_scan_jobs_user_id_idx" ON "kms_scan_jobs"("user_id");

-- CreateIndex
CREATE INDEX "kms_scan_jobs_status_idx" ON "kms_scan_jobs"("status");

-- CreateIndex
CREATE INDEX "kms_files_user_id_idx" ON "kms_files"("user_id");

-- CreateIndex
CREATE INDEX "kms_files_user_id_status_idx" ON "kms_files"("user_id", "status");

-- CreateIndex
CREATE INDEX "kms_files_source_id_idx" ON "kms_files"("source_id");

-- CreateIndex
CREATE INDEX "kms_files_checksum_sha256_idx" ON "kms_files"("checksum_sha256");

-- CreateIndex
CREATE INDEX "kms_chunks_file_id_idx" ON "kms_chunks"("file_id");

-- CreateIndex
CREATE INDEX "kms_chunks_user_id_idx" ON "kms_chunks"("user_id");

-- CreateIndex
CREATE INDEX "kms_duplicate_groups_user_id_idx" ON "kms_duplicate_groups"("user_id");

-- CreateIndex
CREATE INDEX "kms_duplicate_groups_user_id_status_idx" ON "kms_duplicate_groups"("user_id", "status");

-- CreateIndex
CREATE INDEX "kms_file_duplicates_group_id_idx" ON "kms_file_duplicates"("group_id");

-- CreateIndex
CREATE INDEX "kms_file_duplicates_file_id_idx" ON "kms_file_duplicates"("file_id");

-- CreateIndex
CREATE INDEX "kms_transcription_links_kms_file_id_idx" ON "kms_transcription_links"("kms_file_id");

-- CreateIndex
CREATE INDEX "kms_chat_sessions_user_id_idx" ON "kms_chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "kms_chat_sessions_user_id_created_at_idx" ON "kms_chat_sessions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "kms_chat_messages_session_id_idx" ON "kms_chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "kms_chat_messages_session_id_created_at_idx" ON "kms_chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "kms_collections_user_id_idx" ON "kms_collections"("user_id");

-- CreateIndex
CREATE INDEX "kms_collection_files_collection_id_idx" ON "kms_collection_files"("collection_id");

-- CreateIndex
CREATE INDEX "kms_collection_files_file_id_idx" ON "kms_collection_files"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "kms_collection_files_collection_id_file_id_key" ON "kms_collection_files"("collection_id", "file_id");

-- AddForeignKey
ALTER TABLE "kms_scan_jobs" ADD CONSTRAINT "kms_scan_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "kms_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kms_files" ADD CONSTRAINT "kms_files_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "kms_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kms_chunks" ADD CONSTRAINT "kms_chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "kms_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kms_file_duplicates" ADD CONSTRAINT "kms_file_duplicates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "kms_duplicate_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kms_file_duplicates" ADD CONSTRAINT "kms_file_duplicates_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "kms_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kms_transcription_links" ADD CONSTRAINT "kms_transcription_links_kms_file_id_fkey" FOREIGN KEY ("kms_file_id") REFERENCES "kms_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kms_chat_messages" ADD CONSTRAINT "kms_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "kms_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kms_collection_files" ADD CONSTRAINT "kms_collection_files_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "kms_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kms_collection_files" ADD CONSTRAINT "kms_collection_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "kms_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
