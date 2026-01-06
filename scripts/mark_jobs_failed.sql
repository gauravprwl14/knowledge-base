# SQL Script to Manually Mark Processing Jobs as FAILED
# Can be executed directly in PostgreSQL client or through pgAdmin

-- ==================================================
-- Option 1: Mark ALL processing jobs as failed
-- ==================================================

UPDATE jobs 
SET 
    status = 'failed',
    error_message = 'Job manually marked as failed - was stuck in processing state',
    completed_at = NOW()
WHERE status = 'processing';


-- ==================================================
-- Option 2: Mark only jobs processing for more than X minutes as failed
-- ==================================================

-- For jobs processing for more than 60 minutes:
UPDATE jobs 
SET 
    status = 'failed',
    error_message = 'Job timed out - processing for more than 60 minutes',
    completed_at = NOW()
WHERE 
    status = 'processing' 
    AND started_at < NOW() - INTERVAL '60 minutes';


-- ==================================================
-- Option 3: Mark specific job(s) by ID as failed
-- ==================================================

-- Replace 'your-job-id-here' with the actual job UUID
UPDATE jobs 
SET 
    status = 'failed',
    error_message = 'Job manually marked as failed',
    completed_at = NOW()
WHERE 
    id = 'your-job-id-here'  -- Replace with actual UUID
    AND status = 'processing';


-- ==================================================
-- Option 4: Mark jobs matching filename pattern as failed
-- ==================================================

-- For the jobs in your screenshot (zpjl-hhlath-xuqf pattern):
UPDATE jobs 
SET 
    status = 'failed',
    error_message = 'Job manually marked as failed - stuck in processing',
    completed_at = NOW()
WHERE 
    status = 'processing'
    AND original_filename LIKE '%zpjl-hhlath-xuqf%';


-- ==================================================
-- View processing jobs before marking as failed
-- ==================================================

-- Check which jobs are currently processing:
SELECT 
    id, 
    original_filename, 
    status, 
    started_at,
    NOW() - started_at as processing_duration,
    provider,
    model_name
FROM jobs 
WHERE status = 'processing'
ORDER BY started_at;


-- ==================================================
-- Verify the changes after update
-- ==================================================

-- Get summary by status:
SELECT 
    status, 
    COUNT(*) as count 
FROM jobs 
GROUP BY status 
ORDER BY status;

-- Check recently failed jobs:
SELECT 
    id,
    original_filename,
    status,
    error_message,
    completed_at
FROM jobs 
WHERE status = 'failed'
ORDER BY completed_at DESC 
LIMIT 20;
