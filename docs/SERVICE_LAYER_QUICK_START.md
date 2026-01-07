# Service Layer & Error Handling - Quick Start Guide

## For Backend Developers

### Using Error Handling

```python
from app.utils.errors import AppException, JobErrors, create_error_response

# Raise an error
if not job:
    raise AppException(JobErrors.JOB1001)

# Raise with custom message
raise AppException(
    JobErrors.JOB1008,
    detail=f"Cannot delete more than {MAX_JOBS} jobs at once"
)

# Create error response manually
return create_error_response(
    JobErrors.JOB1010,
    detail="Database connection failed",
    data={"retry_after": 30}
)
```

### Using Job Management Service

```python
from app.services.job_management import JobManagementService

# Delete single job
result = await JobManagementService.delete_single_job(
    db=db,
    job_id=job_id,
    api_key_id=api_key.id
)

# Bulk delete
result = await JobManagementService.bulk_delete_jobs(
    db=db,
    job_ids=[uuid1, uuid2, uuid3],
    api_key_id=api_key.id
)
```

### Adding New Error Codes

```python
# In backend/app/utils/errors.py

class JobErrors:
    JOB1012 = ErrorDefinition(
        code="JOB1012",
        message="Job already exists",
        message_key="error.job.JOB1012.already_exists",
        error_type=ErrorType.VALIDATION,
        error_category=ErrorCategory.CLIENT,
        status_code=status.HTTP_409_CONFLICT
    )
```

## For Frontend Developers

### Using Services

```typescript
import { JobService, TranscriptionService } from '@/services';
import { getErrorMessage, logError } from '@/lib/errors';

// List jobs
try {
  const data = await JobService.listJobs({ page: 1, page_size: 20 });
  setJobs(data.jobs);
} catch (error) {
  const message = getErrorMessage(error);
  logError(error, 'fetchJobs');
  showToast(message, 'error');
}

// Delete job
try {
  await JobService.deleteJob(jobId);
  showToast('Job deleted', 'success');
} catch (error) {
  showToast(getErrorMessage(error), 'error');
}

// Bulk delete
try {
  const result = await JobService.bulkDeleteJobs(['uuid1', 'uuid2']);
  showToast(`${result.deleted_count} jobs deleted`, 'success');
} catch (error) {
  showToast(getErrorMessage(error), 'error');
}
```

### Using Error Handling

```typescript
import { AppError, NetworkError, ErrorCodes } from '@/lib/errors';

// Check error type
if (error instanceof AppError) {
  // Specific error code
  if (error.is(ErrorCodes.JOB_NOT_FOUND)) {
    // Handle not found
  }
  
  // Check error category
  if (error.isClientError()) {
    // 4xx error
  }
  
  if (error.isServerError()) {
    // 5xx error
  }
}

// Network error
if (error instanceof NetworkError) {
  // No connection
}
```

### Creating New Services

```typescript
// frontend/services/my-service.ts
import { apiClient } from './api-client';

export class MyService {
  static async getData(): Promise<MyData> {
    return apiClient.get<MyData>('/api/v1/my-endpoint');
  }
  
  static async postData(data: MyRequest): Promise<MyResponse> {
    return apiClient.post<MyResponse>('/api/v1/my-endpoint', data);
  }
}

// Export from services/index.ts
export * from './my-service';
```

## Migration Checklist

When migrating a page to use the service layer:

- [ ] Import services: `import { JobService } from '@/services';`
- [ ] Import error utils: `import { getErrorMessage, logError } from '@/lib/errors';`
- [ ] Replace `fetch()` calls with service methods
- [ ] Add try-catch with `getErrorMessage()` and `logError()`
- [ ] Update error handling to use standardized messages
- [ ] Test all error scenarios

## Common Patterns

### Loading State

```typescript
const [loading, setLoading] = useState(false);

const fetchData = async () => {
  setLoading(true);
  try {
    const data = await JobService.listJobs();
    setJobs(data.jobs);
  } catch (error) {
    showToast(getErrorMessage(error), 'error');
    logError(error, 'fetchData');
  } finally {
    setLoading(false);
  }
};
```

### Form Submission

```typescript
const handleSubmit = async (formData: FormData) => {
  setSubmitting(true);
  try {
    await MyService.submitData(formData);
    showToast('Success!', 'success');
    router.push('/success');
  } catch (error) {
    if (error instanceof AppError && error.is(ErrorCodes.VALIDATION_ERROR)) {
      setFormErrors(error.data?.errors);
    } else {
      showToast(getErrorMessage(error), 'error');
    }
    logError(error, 'formSubmit');
  } finally {
    setSubmitting(false);
  }
};
```

### Confirmation Dialog

```typescript
const handleBulkDelete = async () => {
  const confirmed = window.confirm('Are you sure?');
  if (!confirmed) return;
  
  try {
    const result = await JobService.bulkDeleteJobs(selectedIds);
    showToast(`${result.deleted_count} items deleted`, 'success');
  } catch (error) {
    showToast(getErrorMessage(error), 'error');
    logError(error, 'bulkDelete');
  }
};
```

## Testing

### Backend Tests

```python
import pytest
from app.utils.errors import AppException, JobErrors

def test_delete_job_not_found():
    with pytest.raises(AppException) as exc:
        await JobManagementService.delete_single_job(
            db=db,
            job_id=uuid.uuid4(),
            api_key_id=api_key_id
        )
    assert exc.value.error_def == JobErrors.JOB1001
```

### Frontend Tests

```typescript
import { JobService } from '@/services';
import { AppError, ErrorCodes } from '@/lib/errors';

test('handles job not found error', async () => {
  // Mock API to return 404
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: async () => ({
      errors: [{ errorCode: 'JOB1001', message: 'Job not found' }]
    })
  });
  
  await expect(JobService.getJob('invalid')).rejects.toThrow(AppError);
});
```

## Troubleshooting

### Backend
- Check logs: `podman-compose logs backend`
- Verify error codes are defined in `errors.py`
- Ensure AppException is raised properly
- Check database connections

### Frontend
- Check browser console for errors
- Verify service endpoints match API routes
- Check network tab for failed requests
- Ensure error handling is in try-catch

## Reference

- [ERROR_GUIDE.md](./ERROR_GUIDE.md) - Error handling pattern
- [BULK_DELETE_IMPLEMENTATION.md](./BULK_DELETE_IMPLEMENTATION.md) - Full implementation details
- [SERVICE_LAYER_SUMMARY.md](./SERVICE_LAYER_SUMMARY.md) - Summary of changes

## Support

If you have questions:
1. Check existing documentation
2. Look at examples in jobs page
3. Review service implementations
4. Ask team members
