-- Migration: add DELETED and UNSUPPORTED values to FileStatus enum
-- and add deleted_at column to kms_files for soft-delete audit trail.

-- Add new enum values (PostgreSQL requires ALTER TYPE ... ADD VALUE)
ALTER TYPE "FileStatus" ADD VALUE IF NOT EXISTS 'UNSUPPORTED';
ALTER TYPE "FileStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- Add deleted_at column for soft-delete audit trail
ALTER TABLE kms_files
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
