-- AlterTable: Add Google Drive / external source fields to kms_files
ALTER TABLE "kms_files" ADD COLUMN "external_id" VARCHAR(255),
                         ADD COLUMN "web_view_link" TEXT,
                         ADD COLUMN "external_modified_at" TIMESTAMP(3),
                         ADD COLUMN "metadata" JSONB;
