# Partial Bulk Delete Handling

## Overview

The bulk delete endpoint handles partial success scenarios gracefully, ensuring that successful deletions are committed even when some jobs fail. This document explains how the system handles these scenarios.

## How Partial Delete Works

### Request
```http
POST /api/v1/jobs/bulk/delete
Content-Type: application/json
X-API-Key: your-api-key

{
  "job_ids": [
    "550e8400-e29b-41d4-a716-446655440000",  // Valid - will succeed
    "550e8400-e29b-41d4-a716-446655440001",  // Valid - will succeed
    "550e8400-e29b-41d4-a716-446655440002",  // Invalid job ID - will fail
    "550e8400-e29b-41d4-a716-446655440003",  // Already deleted - will fail
    "550e8400-e29b-41d4-a716-446655440004",  // Valid - will succeed
    ...
    "550e8400-e29b-41d4-a716-446655440009"   // Valid - will succeed
  ]
}
```

### Response (HTTP 200 - Partial Success)
```json
{
  "deleted_count": 8,
  "failed_count": 2,
  "total_requested": 10,
  "deleted_jobs": [
    {
      "job_id": "550e8400-e29b-41d4-a716-446655440000",
      "original_filename": "audio1.mp3",
      "status": "deleted"
    },
    {
      "job_id": "550e8400-e29b-41d4-a716-446655440001",
      "original_filename": "audio2.mp3",
      "status": "deleted"
    },
    // ... 6 more successful deletions
  ],
  "failed_jobs": [
    {
      "job_id": "550e8400-e29b-41d4-a716-446655440002",
      "original_filename": "audio3.mp3",
      "error": "Job not found or access denied"
    },
    {
      "job_id": "550e8400-e29b-41d4-a716-446655440003",
      "original_filename": "audio4.mp3",
      "error": "Database constraint violation"
    }
  ],
  "files_deleted_count": 24,
  "files_failed_count": 2
}
```

## Error Scenarios

### 1. Job Not Found
**Cause**: Job ID doesn't exist in database or belongs to different user

**Result**: Job added to `failed_jobs` with error message

**Example**:
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440008",
  "original_filename": "audio9.mp3",
  "error": "Job not found or access denied"
}
```

### 2. Invalid Job ID Format
**Cause**: Malformed UUID

**Result**: Validation error before processing

**Response** (HTTP 400):
```json
{
  "detail": [
    {
      "loc": ["body", "job_ids", 0],
      "msg": "Input should be a valid UUID",
      "type": "uuid_parsing"
    }
  ]
}
```

### 3. Database Constraint Violation
**Cause**: Foreign key constraints, concurrent deletion, etc.

**Result**: Job added to `failed_jobs` with error message

**Example**:
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440009",
  "original_filename": "audio10.mp3",
  "error": "Database constraint violation"
}
```

### 4. File Deletion Error
**Cause**: File permissions, disk errors, file already deleted

**Result**: Job marked as deleted but file failure tracked

**Example**:
```json
{
  "deleted_count": 10,
  "failed_count": 0,
  "files_deleted_count": 28,
  "files_failed_count": 2,
  "files_failed": [
    {
      "file": "/tmp/audio9.mp3",
      "error": "Permission denied"
    }
  ]
}
```

### 5. Processing Job
**Cause**: Job is currently being processed

**Result**: Job cancelled first, then deleted successfully

**Process**:
1. Job status changed to `CANCELLED`
2. Files deleted
3. Job record deleted
4. Success added to `deleted_jobs`

## Success Scenarios

### All Success
**Request**: 10 valid job IDs

**Response**:
```json
{
  "deleted_count": 10,
  "failed_count": 0,
  "total_requested": 10,
  "deleted_jobs": [...],  // 10 jobs
  "failed_jobs": [],
  "files_deleted_count": 30,
  "files_failed_count": 0
}
```

### Partial Success
**Request**: 10 job IDs (8 valid, 2 invalid)

**Response**:
```json
{
  "deleted_count": 8,
  "failed_count": 2,
  "total_requested": 10,
  "deleted_jobs": [...],  // 8 jobs
  "failed_jobs": [...],   // 2 jobs with errors
  "files_deleted_count": 24,
  "files_failed_count": 0
}
```

### All Failed
**Request**: 10 invalid job IDs

**Response** (HTTP 404):
```json
{
  "errors": [{
    "errorCode": "JOB1001",
    "statusCode": 404,
    "message": "No matching jobs found for deletion",
    "type": "not_found",
    "category": "resource"
  }]
}
```

## Transaction Handling

The bulk delete uses a **commit-on-success** strategy:

1. **Fetch all jobs** matching the job IDs and user
2. **Process each job individually**:
   - Cancel if processing
   - Delete files
   - Mark for database deletion
   - Track success or failure
3. **Commit transaction** for all successful deletions
4. **Rollback on commit failure** and return error

### Why This Approach?

**Pros**:
- Maximizes successful deletions
- Provides detailed failure information
- User gets immediate results for successful deletions
- Failed jobs can be retried individually

**Cons**:
- Partial state if some jobs fail
- Requires client-side handling of partial success

### Alternative: All-or-Nothing

If you need all-or-nothing behavior, modify the service:

```python
# In bulk_delete_jobs method
if failed_jobs:
    await db.rollback()
    raise AppException(
        JobErrors.JOB1009,
        detail=f"Bulk delete failed: {len(failed_jobs)} jobs could not be deleted"
    )
```

## Client-Side Handling

### Frontend Example

```typescript
const handleBulkDelete = async (jobIds: string[]) => {
  try {
    const result = await JobService.bulkDeleteJobs(jobIds);
    
    // Check for full success
    if (result.failed_count === 0) {
      toast({
        title: 'Success',
        description: `Deleted ${result.deleted_count} jobs`,
        variant: 'success'
      });
    } 
    // Partial success
    else {
      toast({
        title: 'Partial Success',
        description: `Deleted ${result.deleted_count} jobs, ${result.failed_count} failed`,
        variant: 'warning'
      });
      
      // Show detailed errors
      result.failed_jobs.forEach(failure => {
        console.error(`Failed to delete ${failure.job_id}: ${failure.error}`);
      });
      
      // Optionally, show failed jobs in UI
      setFailedJobs(result.failed_jobs);
    }
    
    // Refresh the list
    await fetchJobs();
    
  } catch (error) {
    // Complete failure (validation error, no jobs found, etc.)
    const appError = parseErrorResponse(error);
    toast({
      title: 'Error',
      description: getErrorMessage(appError),
      variant: 'destructive'
    });
  }
};
```

### Backend API Client Example

```python
import httpx

async def bulk_delete_jobs(job_ids: List[str], api_key: str):
    """Delete multiple jobs with partial success handling"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://api.example.com/api/v1/jobs/bulk/delete",
            json={"job_ids": job_ids},
            headers={"X-API-Key": api_key}
        )
        
        if response.status_code == 200:
            result = response.json()
            
            print(f"Deleted: {result['deleted_count']}")
            print(f"Failed: {result['failed_count']}")
            
            if result['failed_count'] > 0:
                print("Failed jobs:")
                for failure in result['failed_jobs']:
                    print(f"  - {failure['job_id']}: {failure['error']}")
            
            return result
        else:
            # Handle validation errors
            response.raise_for_status()
```

## Monitoring and Logging

### Backend Logs

```python
# Service logs
logger.info(
    f"Bulk delete completed: {len(deleted_jobs)} deleted, "
    f"{len(failed_jobs)} failed out of {len(job_ids)} requested"
)

# Individual failures
for failure in failed_jobs:
    logger.error(f"Failed to delete job {failure['job_id']}: {failure['error']}")
```

### Metrics to Track

1. **Success Rate**: `deleted_count / total_requested`
2. **File Deletion Success**: `files_deleted_count / (files_deleted_count + files_failed_count)`
3. **Common Failure Reasons**: Track error types
4. **Performance**: Time taken for bulk operations

### Example Monitoring Query

```sql
-- Track bulk delete operations
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_operations,
    AVG(deleted_count) as avg_deleted,
    AVG(failed_count) as avg_failed,
    SUM(CASE WHEN failed_count > 0 THEN 1 ELSE 0 END) as partial_failures
FROM bulk_delete_audit_log
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Best Practices

### For Clients

1. **Check `failed_count`** before assuming complete success
2. **Display failed jobs** to users with error messages
3. **Implement retry logic** for failed jobs
4. **Validate job IDs** before sending (UUID format)
5. **Batch size**: Use 20-50 jobs per request for better performance

### For Developers

1. **Always return HTTP 200** for partial success
2. **Include detailed error messages** in `failed_jobs`
3. **Log all failures** for debugging
4. **Commit successful deletions** even if some fail
5. **Track metrics** for monitoring

## Testing Partial Success

### Unit Test Example

```python
@pytest.mark.asyncio
async def test_bulk_delete_partial_success(db_session):
    """Test bulk delete with some failures"""
    # Create 3 valid jobs
    valid_jobs = [create_job() for _ in range(3)]
    for job in valid_jobs:
        db_session.add(job)
    await db_session.commit()
    
    # Mix valid and invalid job IDs
    job_ids = [job.id for job in valid_jobs] + [uuid4(), uuid4()]
    
    result = await JobManagementService.bulk_delete_jobs(
        db=db_session,
        job_ids=job_ids,
        api_key_id=test_api_key.id
    )
    
    assert result["deleted_count"] == 3
    assert result["failed_count"] == 2
    assert result["total_requested"] == 5
    assert len(result["deleted_jobs"]) == 3
    assert len(result["failed_jobs"]) == 2
```

### Integration Test Example

```typescript
describe('Bulk Delete - Partial Success', () => {
  it('should handle partial success correctly', async () => {
    // Create 10 jobs
    const validIds = await createTestJobs(10);
    
    // Mix with invalid IDs
    const allIds = [...validIds.slice(0, 8), 'invalid-1', 'invalid-2'];
    
    const result = await JobService.bulkDeleteJobs(allIds);
    
    expect(result.deleted_count).toBe(8);
    expect(result.failed_count).toBe(2);
    expect(result.total_requested).toBe(10);
    expect(result.failed_jobs).toHaveLength(2);
  });
});
```

## Error Code Reference

| Code | Status | Description | Handling |
|------|--------|-------------|----------|
| JOB1001 | 404 | Job not found | Individual failure |
| JOB1007 | 400 | Empty job list | Complete failure |
| JOB1008 | 400 | Limit exceeded | Complete failure |
| JOB1010 | 500 | Database error | Complete failure |

## FAQ

### Q: Why return HTTP 200 for partial failures?
**A**: Because some jobs were successfully deleted. HTTP 200 indicates the operation completed, and the response body contains details about successes and failures.

### Q: Should I retry failed jobs automatically?
**A**: Depends on the error. Retry for transient errors (network, timeout) but not for permanent errors (job not found, invalid ID).

### Q: What if all jobs fail?
**A**: Returns HTTP 404 with error `JOB1001` and message "No matching jobs found for deletion".

### Q: Are successful deletions rolled back if some fail?
**A**: No. Successful deletions are committed. This is by design to maximize successful operations.

### Q: How do I handle file deletion failures?
**A**: Check `files_failed_count`. If > 0, inspect `files_failed` array for details. Jobs are still marked as deleted.

### Q: Can I delete more than 100 jobs?
**A**: No. Split into multiple requests of ≤100 jobs each.

## Summary

The partial bulk delete handling ensures:

✅ **Maximum Success**: Commits all successful deletions  
✅ **Detailed Feedback**: Provides success/failure breakdown  
✅ **Error Information**: Includes error messages for failures  
✅ **File Tracking**: Tracks file deletion success/failure  
✅ **Client Control**: Clients decide how to handle partial success  
✅ **Transaction Safety**: Database operations are transactional  
✅ **Logging**: All operations are logged for debugging  

For 10 requests with 2 errors:
- **Result**: HTTP 200
- **deleted_count**: 8
- **failed_count**: 2  
- **failed_jobs**: Array with 2 items containing error details
- **Action**: 8 jobs permanently deleted, 2 failed with reasons
