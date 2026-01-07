# Bulk Delete Implementation & Service Layer Integration

## Overview

This document describes the implementation of bulk delete functionality and the integration of a service layer pattern following the ERROR_GUIDE.md standards.

## What Was Implemented

### 1. Backend Implementation

#### Error Handling System (`backend/app/utils/errors.py`)

Implemented a standardized error handling system following ERROR_GUIDE.md pattern:

- **Error Types**: VALIDATION, AUTHENTICATION, AUTHORIZATION, DATABASE, etc.
- **Error Categories**: CLIENT, SERVER, SECURITY, DATABASE, etc.
- **Error Codes**: JOB1001-JOB1011 for job-related errors

Key error codes:
- `JOB1001`: Job not found
- `JOB1002`: Unauthorized access
- `JOB1003`: Cannot cancel job in current state
- `JOB1004`: Cannot delete job while processing
- `JOB1005`: Failed to delete associated files
- `JOB1006`: File not found for job
- `JOB1007`: No jobs provided for bulk operation
- `JOB1008`: Bulk operation limit exceeded (100 jobs max)
- `JOB1009`: Bulk partial failure
- `JOB1010`: Database error
- `JOB1011`: Transcription not found

#### Job Management Service (`backend/app/services/job_management.py`)

Created a centralized service for job operations:

- **`delete_job_files(job)`**: Handles deletion of original and processed files
- **`delete_single_job(db, job_id, api_key_id)`**: Delete single job with all data
- **`bulk_delete_jobs(db, job_ids, api_key_id)`**: Delete multiple jobs at once

Features:
- Automatic file cleanup (original + processed WAV files)
- Cascade deletion of transcriptions and translations
- Partial success handling (some jobs can succeed while others fail)
- Detailed response with success/failure breakdown
- Maximum 100 jobs per bulk operation

#### API Endpoints (`backend/app/api/v1/endpoints/jobs.py`)

Updated endpoints to use new error handling:

- **GET `/api/v1/jobs`**: List jobs (existing, no changes)
- **GET `/api/v1/jobs/{job_id}`**: Get single job (updated with AppException)
- **DELETE `/api/v1/jobs/{job_id}`**: Delete single job (refactored to use service)
- **POST `/api/v1/jobs/{job_id}/cancel`**: Cancel job (updated with AppException)
- **POST `/api/v1/jobs/bulk/delete`**: **NEW** Bulk delete endpoint

Bulk delete request/response:

```json
// Request
{
  "job_ids": [
    "uuid1",
    "uuid2",
    "uuid3"
  ]
}

// Response
{
  "deleted_count": 2,
  "failed_count": 1,
  "total_requested": 3,
  "deleted_jobs": [
    {
      "job_id": "uuid1",
      "original_filename": "file1.mp3",
      "status": "deleted"
    }
  ],
  "failed_jobs": [
    {
      "job_id": "uuid3",
      "original_filename": "file3.mp3",
      "error": "Job not found"
    }
  ],
  "files_deleted_count": 4,
  "files_failed_count": 0
}
```

### 2. Frontend Implementation

#### Error Handling (`frontend/lib/errors/`)

Created a comprehensive error handling system:

**`types.ts`**:
- `ErrorType` enum matching backend
- `ErrorCategory` enum matching backend
- `ApiError` interface
- `AppError` class with helper methods
- `NetworkError` class
- `ErrorCodes` constants

**`utils.ts`**:
- `getErrorMessage(error)`: Extract user-friendly message
- `logError(error, context)`: Log errors consistently
- `isRetryableError(error)`: Check if error should be retried
- `isAuthError(error)`: Check for auth errors
- `formatErrorForToast(error)`: Format for toast display
- `parseErrorResponse(error)`: Parse API error responses

#### Service Layer (`frontend/services/`)

Created a centralized service layer for all API calls:

**`api-client.ts`**:
- Base `ApiClient` class with timeout handling
- Automatic error parsing
- Methods: `get()`, `post()`, `put()`, `delete()`, `patch()`
- Query parameter building
- Abort controller for timeouts

**`job-service.ts`**:
- `JobService.listJobs(params)`: List jobs with pagination
- `JobService.getJob(jobId)`: Get single job
- `JobService.deleteJob(jobId)`: Delete single job
- `JobService.bulkDeleteJobs(jobIds)`: **NEW** Bulk delete jobs
- `JobService.cancelJob(jobId)`: Cancel job
- `JobService.refreshJobs(params)`: Refresh job list

**`transcription-service.ts`**:
- `TranscriptionService.listTranscriptions(params)`: List transcriptions
- `TranscriptionService.getTranscription(id)`: Get single transcription
- `TranscriptionService.getTranscriptionByJobId(jobId)`: Get by job ID
- `TranscriptionService.downloadTranscription(id, format)`: Download transcription
- `TranscriptionService.triggerBrowserDownload(blob, filename)`: Helper for downloads

#### UI Updates (`frontend/app/[locale]/(dashboard)/jobs/page.tsx`)

Updated Jobs page to use service layer:

- ✅ All API calls moved to service layer
- ✅ Consistent error handling with `getErrorMessage()` and `logError()`
- ✅ **NEW**: Bulk delete button with confirmation
- ✅ Loading states for bulk operations
- ✅ Success/error toast notifications
- ✅ Partial success handling

New UI features:
- Bulk delete button appears when jobs are selected
- Confirmation dialog before bulk delete
- Shows "Delete X Selected" with count
- Disables button during deletion
- Shows appropriate success/warning messages

#### API Routes (`frontend/app/api/v1/jobs/bulk/delete/route.ts`)

Created proxy route for bulk delete:

- Forwards requests to backend
- Adds authentication header
- Returns standardized error responses
- Proper error handling

## Usage

### Backend (Python)

```python
from app.services.job_management import JobManagementService
from app.utils.errors import AppException, JobErrors

# Delete single job
try:
    result = await JobManagementService.delete_single_job(
        db=db,
        job_id=job_id,
        api_key_id=api_key.id
    )
except AppException as e:
    # Handle error
    if e.error_def == JobErrors.JOB1001:
        print("Job not found")
```

### Frontend (TypeScript)

```typescript
import { JobService } from '@/services';
import { getErrorMessage, logError, AppError, ErrorCodes } from '@/lib/errors';

// Bulk delete jobs
try {
  const result = await JobService.bulkDeleteJobs(['uuid1', 'uuid2']);
  console.log(`Deleted ${result.deleted_count} jobs`);
} catch (error) {
  // AppError with error code
  if (error instanceof AppError) {
    if (error.is(ErrorCodes.JOB_NOT_FOUND)) {
      showToast('Jobs not found', 'error');
    }
  }
  
  // Or generic error handling
  const message = getErrorMessage(error);
  logError(error, 'bulkDelete');
  showToast(message, 'error');
}
```

## Benefits

### 1. Consistency
- All errors follow the same pattern
- All API calls go through services
- Predictable error handling

### 2. Maintainability
- Centralized API logic
- Easy to update endpoints
- Easy to add new services

### 3. Type Safety
- Full TypeScript types
- Error code constants
- Proper interfaces

### 4. User Experience
- Clear error messages
- Proper loading states
- Bulk operations for efficiency

### 5. Developer Experience
- Easy to use service methods
- Comprehensive error information
- Consistent patterns

## Migration Guide

To migrate other pages to use the service layer:

1. **Import services**:
   ```typescript
   import { JobService, TranscriptionService } from '@/services';
   import { getErrorMessage, logError } from '@/lib/errors';
   ```

2. **Replace fetch calls**:
   ```typescript
   // Before
   const response = await fetch('/api/v1/jobs');
   const data = await response.json();
   
   // After
   const data = await JobService.listJobs();
   ```

3. **Add error handling**:
   ```typescript
   try {
     const data = await JobService.listJobs();
   } catch (error) {
     const message = getErrorMessage(error);
     logError(error, 'fetchJobs');
     showToast(message, 'error');
   }
   ```

## Next Steps

1. **Migrate other pages**:
   - Upload page
   - Transcription pages
   - Settings pages

2. **Add more services**:
   - Upload service
   - Translation service
   - User/API key service

3. **Enhance error handling**:
   - Retry logic for retryable errors
   - Global error boundary
   - Error reporting/analytics

4. **Add tests**:
   - Unit tests for services
   - Integration tests for endpoints
   - E2E tests for bulk operations

## Testing

### Backend Testing

```bash
# Test bulk delete endpoint
curl -X POST http://localhost:8000/api/v1/jobs/bulk/delete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"job_ids": ["uuid1", "uuid2"]}'
```

### Frontend Testing

1. Navigate to jobs page
2. Select multiple completed jobs using checkboxes
3. Click "Delete X Selected" button
4. Confirm deletion
5. Verify jobs are deleted and toast shows success

## Files Changed/Created

### Backend
- ✨ Created: `backend/app/utils/errors.py`
- ✨ Created: `backend/app/services/job_management.py`
- ✨ Created: `backend/app/schemas/bulk.py`
- ♻️ Updated: `backend/app/api/v1/endpoints/jobs.py`

### Frontend
- ✨ Created: `frontend/lib/errors/types.ts`
- ✨ Created: `frontend/lib/errors/utils.ts`
- ♻️ Updated: `frontend/lib/errors/index.ts`
- ✨ Created: `frontend/services/api-client.ts`
- ✨ Created: `frontend/services/job-service.ts`
- ✨ Created: `frontend/services/transcription-service.ts`
- ✨ Created: `frontend/services/index.ts`
- ✨ Created: `frontend/app/api/v1/jobs/bulk/delete/route.ts`
- ♻️ Updated: `frontend/app/[locale]/(dashboard)/jobs/page.tsx`

## Error Code Reference

| Code | Description | HTTP Status | Category |
|------|-------------|-------------|----------|
| JOB1001 | Job not found | 404 | CLIENT |
| JOB1002 | Unauthorized access | 403 | SECURITY |
| JOB1003 | Cannot cancel job | 400 | CLIENT |
| JOB1004 | Cannot delete while processing | 400 | CLIENT |
| JOB1005 | File deletion failed | 500 | SERVER |
| JOB1006 | File not found | 404 | SERVER |
| JOB1007 | No jobs provided | 400 | CLIENT |
| JOB1008 | Bulk limit exceeded | 400 | CLIENT |
| JOB1009 | Bulk partial failure | 207 | SERVER |
| JOB1010 | Database error | 500 | DATABASE |
| JOB1011 | Transcription not found | 404 | CLIENT |
