# Quick Reference: Manual Job Management

## Marking Stuck Jobs as Failed

### Method 1: Using the Shell Script (Recommended)

```bash
# Run the automated script
./scripts/mark_jobs_failed.sh

# Or with custom database credentials
DB_HOST=localhost DB_PORT=5432 ./scripts/mark_jobs_failed.sh
```

### Method 2: Direct SQL Commands

#### Mark ALL processing jobs as failed:
```bash
PGPASSWORD=voiceapp psql -h localhost -p 5432 -U voiceapp -d voiceapp -c \
"UPDATE jobs SET status = 'FAILED', error_message = 'Manually marked as failed', completed_at = NOW() WHERE status::text = 'PROCESSING';"
```

#### Mark jobs processing for more than 60 minutes:
```bash
PGPASSWORD=voiceapp psql -h localhost -p 5432 -U voiceapp -d voiceapp -c \
"UPDATE jobs SET status = 'FAILED', error_message = 'Timed out', completed_at = NOW() WHERE status::text = 'PROCESSING' AND started_at < NOW() - INTERVAL '60 minutes';"
```

#### Mark specific job by filename pattern:
```bash
PGPASSWORD=voiceapp psql -h localhost -p 5432 -U voiceapp -d voiceapp -c \
"UPDATE jobs SET status = 'FAILED', error_message = 'Manually failed', completed_at = NOW() WHERE status::text = 'PROCESSING' AND original_filename LIKE '%zpjl-hhlath-xuqf%';"
```

### Method 3: Using SQL File

```bash
# Run the SQL script with specific query
psql -h localhost -p 5432 -U voiceapp -d voiceapp -f scripts/mark_jobs_failed.sql
```

## Checking Job Status

### View processing jobs:
```bash
PGPASSWORD=voiceapp psql -h localhost -p 5432 -U voiceapp -d voiceapp -c \
"SELECT id, original_filename, status::text, started_at, NOW() - started_at as duration FROM jobs WHERE status::text = 'PROCESSING';"
```

### View job status summary:
```bash
PGPASSWORD=voiceapp psql -h localhost -p 5432 -U voiceapp -d voiceapp -c \
"SELECT status::text, COUNT(*) FROM jobs GROUP BY status::text;"
```

### View recent failed jobs:
```bash
PGPASSWORD=voiceapp psql -h localhost -p 5432 -U voiceapp -d voiceapp -c \
"SELECT id, original_filename, error_message, completed_at FROM jobs WHERE status::text = 'FAILED' ORDER BY completed_at DESC LIMIT 10;"
```

## Using the API

### Via curl:
```bash
# Get all jobs
curl -s "http://localhost:8000/api/v1/jobs" \
  -H "X-API-Key: your-api-key-here"

# Get specific job
curl -s "http://localhost:8000/api/v1/jobs/{job_id}" \
  -H "X-API-Key: your-api-key-here"

# Cancel a job (marks as CANCELLED, not FAILED)
curl -X POST "http://localhost:8000/api/v1/jobs/{job_id}/cancel" \
  -H "X-API-Key: your-api-key-here"
```

## Important Notes

1. **ENUM Values**: PostgreSQL stores job status as ENUM in UPPERCASE:
   - ✅ Correct: `'PROCESSING'`, `'FAILED'`, `'COMPLETED'`
   - ❌ Wrong: `'processing'`, `'failed'`, `'completed'`

2. **Type Casting**: Always cast status to text when comparing:
   ```sql
   WHERE status::text = 'PROCESSING'
   ```

3. **Connection String**: 
   ```
   postgresql://voiceapp:voiceapp@localhost:5432/voiceapp
   ```

4. **Environment Variables**:
   ```bash
   export PGHOST=localhost
   export PGPORT=5432
   export PGUSER=voiceapp
   export PGPASSWORD=voiceapp
   export PGDATABASE=voiceapp
   
   # Then simply use:
   psql -c "SELECT * FROM jobs;"
   ```

## Automated Monitoring

The application includes a job monitor service that automatically marks stale jobs as failed:

- **File**: `backend/app/services/job_monitor.py`
- **Timeout**: Configured in `backend/app/config.py` (default: 60 minutes)
- **Runs every**: 5 minutes (configurable)

To manually trigger the monitor (if running):
```python
from app.services.job_monitor import JobMonitor
monitor = JobMonitor()
await monitor.check_stale_jobs()
```
