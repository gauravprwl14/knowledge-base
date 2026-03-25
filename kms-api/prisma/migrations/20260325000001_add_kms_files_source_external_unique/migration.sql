-- AddUniqueIndex
-- Required by scan-worker upsert: ON CONFLICT (source_id, external_id)
CREATE UNIQUE INDEX IF NOT EXISTS "kms_files_source_id_external_id_key" ON "kms_files"("source_id", "external_id");
