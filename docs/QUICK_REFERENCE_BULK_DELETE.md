# Partial Bulk Delete - Quick Reference

## How It Works

**Scenario**: Delete 10 jobs, where 2 have errors

### Request
```bash
POST /api/v1/jobs/bulk/delete
X-API-Key: your-api-key

{
  "job_ids": [
    "job-1",  # ✅ Valid
    "job-2",  # ✅ Valid
    "job-3",  # ❌ Not found
    "job-4",  # ✅ Valid
    "job-5",  # ❌ Database error
    "job-6",  # ✅ Valid
    "job-7",  # ✅ Valid
    "job-8",  # ✅ Valid
    "job-9",  # ✅ Valid
    "job-10"  # ✅ Valid
  ]
}
```

### Response (HTTP 200)
```json
{
  "deleted_count": 8,        // 8 successfully deleted
  "failed_count": 2,         // 2 failed
  "total_requested": 10,     // 10 total requested
  
  "deleted_jobs": [
    {"job_id": "job-1", "status": "deleted"},
    {"job_id": "job-2", "status": "deleted"},
    // ... 6 more
  ],
  
  "failed_jobs": [
    {
      "job_id": "job-3",
      "error": "Job not found or access denied"
    },
    {
      "job_id": "job-5",
      "error": "Database constraint violation"
    }
  ],
  
  "files_deleted_count": 24,  // 8 jobs × 3 files each
  "files_failed_count": 0     // All files deleted successfully
}
```

## Key Points

✅ **HTTP 200 on Partial Success**: Not an error if some jobs deleted  
✅ **Commits Successful Deletions**: 8 jobs permanently deleted  
✅ **Detailed Failure Info**: 2 failed jobs with error messages  
✅ **Check `failed_count`**: Always check this field  
✅ **Retry Strategy**: Retry failed jobs individually if needed  

## Error Types

| Error | Cause | Added to `failed_jobs` |
|-------|-------|----------------------|
| Job not found | Invalid ID or unauthorized | ✅ Yes |
| Database error | Constraint violation | ✅ Yes |
| File error | Permission denied | ⚠️ Job deleted, file tracked separately |
| Invalid UUID | Malformed ID | ❌ No - returns HTTP 400 |
| Empty list | No job IDs | ❌ No - returns HTTP 400 |
| > 100 jobs | Limit exceeded | ❌ No - returns HTTP 400 |

## Client Handling

```typescript
const result = await bulkDeleteJobs(jobIds);

if (result.failed_count === 0) {
  // All success
  showSuccess(`Deleted ${result.deleted_count} jobs`);
} else {
  // Partial success
  showWarning(
    `Deleted ${result.deleted_count} jobs, ` +
    `${result.failed_count} failed`
  );
  
  // Show failed jobs
  result.failed_jobs.forEach(failure => {
    console.error(`${failure.job_id}: ${failure.error}`);
  });
}
```

## Documentation

📚 **Full Details**: [docs/PARTIAL_BULK_DELETE.md](PARTIAL_BULK_DELETE.md)  
🔧 **API Docs**: http://localhost:8000/docs  
📖 **Swagger UI**: Interactive testing with examples  

## Quick Test

```bash
# Test with cURL
curl -X POST http://localhost:8000/api/v1/jobs/bulk/delete \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "job_ids": [
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001"
    ]
  }'
```

## Summary

**10 requests, 2 errors:**
- ✅ **8 deleted** - Files cleaned up, database records removed
- ❌ **2 failed** - Error messages provided, can be retried
- 📊 **Response** - HTTP 200 with detailed breakdown
- 💾 **Transaction** - Successful deletions committed
- 🔄 **Retry** - Failed jobs can be retried individually
