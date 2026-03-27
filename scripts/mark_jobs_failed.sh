#!/bin/bash
# Script to manually mark stuck/processing jobs as FAILED

# Database connection details from docker-compose.yml
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-voiceapp}"
DB_USER="${DB_USER:-voiceapp}"
DB_PASSWORD="${DB_PASSWORD:-voiceapp}"

echo "Marking all PROCESSING jobs as FAILED..."

# SQL command to update processing jobs to failed
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << EOF

-- Show jobs that will be marked as failed
SELECT id, original_filename, status, started_at, 
       NOW() - started_at as processing_duration
FROM jobs 
WHERE status = 'processing'
ORDER BY started_at;

-- Update processing jobs to failed
UPDATE jobs 
SET 
    status = 'failed',
    error_message = 'Job manually marked as failed - was stuck in processing state',
    completed_at = NOW()
WHERE status = 'processing'
RETURNING id, original_filename, status;

-- Show summary
SELECT 
    status, 
    COUNT(*) as count 
FROM jobs 
GROUP BY status 
ORDER BY status;

EOF

echo "Done! All processing jobs have been marked as FAILED."
