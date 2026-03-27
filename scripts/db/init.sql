-- KMS Database Initialization
-- Creates required extensions and schemas.
-- Tables are created by application-level migrations (Alembic / Prisma).

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- trigram indexes for LIKE search
CREATE EXTENSION IF NOT EXISTS "unaccent";        -- accent-insensitive search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- gen_random_uuid(), encryption helpers

-- Fix search_path for the kms user so Prisma resolves tables in public schema
-- Without this, tables created by a user named 'kms' go to the 'kms' schema
-- (PostgreSQL sets search_path="$user",public by default).
ALTER USER kms SET search_path TO public;

-- Schemas (application-level namespaces, separate from the default search_path)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS kms_app;
CREATE SCHEMA IF NOT EXISTS voice;
CREATE SCHEMA IF NOT EXISTS graph_cache;

-- Full-text search configuration (accent-insensitive)
CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS kms_fts (COPY = pg_catalog.english);
ALTER TEXT SEARCH CONFIGURATION kms_fts
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, english_stem;
