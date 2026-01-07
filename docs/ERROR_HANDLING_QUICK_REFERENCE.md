# Error Handling Quick Reference

Quick reference guide for error handling in the Voice App platform.

## Standard Error Format

```json
{
  "errors": [{
    "errorCode": "JOB1001",
    "message": "Job not found",
    "type": "not_found",
    "category": "resource",
    "data": {"job_id": "123"}
  }],
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "path": "/api/v1/jobs/123"
  }
}
```

## Backend Quick Reference

### Raise Standard Error

```python
from app.utils.errors import AppException, JobErrors

raise AppException(
    JobErrors.JOB_NOT_FOUND,
    detail="Job with ID 123 not found",
    data={"job_id": 123}
)
```

### Define Custom Error

```python
from app.utils.errors import ErrorDefinition, ErrorType, ErrorCategory

MY_ERROR = ErrorDefinition(
    code="APP1001",
    message="Custom error",
    type=ErrorType.VALIDATION_ERROR,
    category=ErrorCategory.INPUT_VALIDATION,
    status_code=400
)
```

### Pydantic Validation

```python
from pydantic import BaseModel, validator

class JobCreate(BaseModel):
    title: str
    
    @validator('title')
    def validate_title(cls, v):
        if len(v) < 3:
            raise ValueError('Title must be at least 3 characters')
        return v
```

**Result:** Automatically returns standard error format with `errorCode: "VAL1000"`

## Frontend Quick Reference

### Parse API Error

```typescript
import { parseErrorResponse } from '@/lib/errors';

try {
  await apiClient.post('/jobs', data);
} catch (error) {
  const parsed = parseErrorResponse(error);
  console.error(parsed.errors[0].errorCode);
  console.error(parsed.errors[0].message);
  toast.error(parsed.message);
}
```

### Error Boundary

```typescript
import { ErrorBoundary } from '@/components/error-boundary';

<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>
```

### Manual Error Throw

```typescript
import { useErrorHandler } from '@/components/error-boundary';

const throwError = useErrorHandler();

try {
  await riskyOperation();
} catch (error) {
  throwError(error as Error);
}
```

### Configure API Client

```typescript
import { ApiClient } from '@/services/api-client';

const apiClient = new ApiClient({
  baseURL: '/api',
  maxRetries: 3,       // Number of retry attempts
  retryDelay: 1000,    // Initial delay in ms (exponential backoff)
});
```

## Error Types

| Type | Description | Example |
|------|-------------|---------|
| `validation_error` | Invalid input | Missing required field |
| `not_found` | Resource doesn't exist | Job ID not found |
| `unauthorized` | Not authenticated | Missing auth token |
| `forbidden` | Not authorized | Insufficient permissions |
| `conflict` | Resource conflict | Duplicate entry |
| `internal_error` | Server error | Database error |
| `external_service_error` | External API error | S3 upload failed |
| `rate_limit_exceeded` | Too many requests | Rate limit hit |

## Error Categories

| Category | Description | Example |
|----------|-------------|---------|
| `input_validation` | User input error | Invalid email format |
| `resource` | Resource operation | Job not found |
| `authentication` | Auth error | Invalid credentials |
| `authorization` | Permission error | Access denied |
| `business_logic` | Business rule | Cannot delete in-progress job |
| `system` | System error | Database connection failed |
| `external_service` | External API error | S3 service unavailable |
| `rate_limiting` | Rate limit | Too many requests |

## Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| VAL1000 | Validation error | 400 |
| JOB1001 | Job not found | 404 |
| JOB1002 | Invalid job status | 400 |
| JOB1003 | Job not owned by user | 403 |
| JOB1010 | Database error | 500 |
| SYS9000 | Internal server error | 500 |

## HTTP Status Codes

| Status | Description | When to Use |
|--------|-------------|-------------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation error |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable Entity | Business logic error |
| 500 | Internal Server Error | Server error |
| 502 | Bad Gateway | Gateway error |
| 503 | Service Unavailable | Service down |

## Request Headers

| Header | Description | Example |
|--------|-------------|---------|
| `X-Request-ID` | Unique request ID | `550e8400-e29b-41d4-a716-446655440000` |
| `Content-Type` | Content type | `application/json` |
| `Authorization` | Auth token | `Bearer <token>` |
| `Accept-Language` | Language | `en` |

## Retry Logic

The API client automatically retries:
- **Network errors** (no response)
- **502 Bad Gateway**
- **503 Service Unavailable**
- **504 Gateway Timeout**

With **exponential backoff**: 1s → 2s → 4s

## Error Pages

Custom error pages available:
- **404** - Not Found → [app/not-found.tsx](../frontend/app/not-found.tsx)
- **500** - Internal Error → [app/global-error.tsx](../frontend/app/global-error.tsx)
- **502** - Bad Gateway → [app/502.tsx](../frontend/app/502.tsx)
- **503** - Service Unavailable → [app/503.tsx](../frontend/app/503.tsx)

## Testing

### Backend Test

```python
def test_standard_error_format():
    response = client.delete("/jobs/123")
    
    assert response.status_code == 404
    data = response.json()
    
    assert "errors" in data
    assert data["errors"][0]["errorCode"] == "JOB1001"
    assert data["errors"][0]["type"] == "not_found"
    assert "meta" in data
```

### Frontend Test

```typescript
it('should handle standard error', async () => {
  mockApi.onDelete('/jobs/123').reply(404, {
    errors: [{
      errorCode: 'JOB1001',
      message: 'Job not found',
      type: 'not_found',
      category: 'resource',
      data: { job_id: '123' }
    }],
    meta: {
      timestamp: '2024-01-15T10:30:00Z',
      path: '/api/v1/jobs/123'
    }
  });
  
  await expect(deleteJob('123')).rejects.toThrow();
});
```

## Documentation Links

- [Generic Coding Practices](./guides/GENERIC_CODING_PRACTICES.md)
- [Frontend Error Handling](./guides/Frontend/ERROR_HANDLING.md)
- [Backend Exception Handlers](./guides/Backend/EXCEPTION_HANDLERS.md)
- [Standard Error Format](./STANDARD_ERROR_FORMAT.md)
- [Implementation Summary](./ERROR_HANDLING_IMPLEMENTATION.md)

---

**Last Updated:** 2024-01-15
