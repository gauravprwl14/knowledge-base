-- Migration: add_tags
-- Creates kms_tags and kms_file_tags tables for the relational tag system.

-- -----------------------------------------------------------------------
-- kms_tags — one row per user-defined tag
-- -----------------------------------------------------------------------
CREATE TABLE "kms_tags" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID         NOT NULL,
    "name"       TEXT         NOT NULL,
    "color"      TEXT         NOT NULL DEFAULT '#6366f1',
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT "kms_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "kms_tags_user_id_name_key" UNIQUE ("user_id", "name")
);

-- -----------------------------------------------------------------------
-- kms_file_tags — many-to-many join between kms_files and kms_tags
-- source distinguishes manually applied vs. AI-suggested tags
-- -----------------------------------------------------------------------
CREATE TABLE "kms_file_tags" (
    "file_id"    UUID         NOT NULL,
    "tag_id"     UUID         NOT NULL,
    "source"     TEXT         NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT "kms_file_tags_pkey"       PRIMARY KEY ("file_id", "tag_id"),
    CONSTRAINT "kms_file_tags_file_id_fkey"
        FOREIGN KEY ("file_id") REFERENCES "kms_files"("id") ON DELETE CASCADE,
    CONSTRAINT "kms_file_tags_tag_id_fkey"
        FOREIGN KEY ("tag_id") REFERENCES "kms_tags"("id")  ON DELETE CASCADE
);

-- -----------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------
CREATE INDEX "kms_tags_user_id_idx"      ON "kms_tags"("user_id");
CREATE INDEX "kms_file_tags_tag_id_idx"  ON "kms_file_tags"("tag_id");
CREATE INDEX "kms_file_tags_file_id_idx" ON "kms_file_tags"("file_id");
