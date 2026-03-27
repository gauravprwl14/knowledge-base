# Generic Coding Practices & Standards

This document outlines generic coding practices and standards that should be followed across all applications in the Voice App platform (Frontend, Backend, Mobile).

## Table of Contents

1. [Error Handling](#error-handling)
2. [API Design](#api-design)
3. [Code Organization](#code-organization)
4. [Testing Standards](#testing-standards)
5. [Security Practices](#security-practices)
6. [Performance Guidelines](#performance-guidelines)
7. [Documentation](#documentation)
8. [Version Control](#version-control)

---

## Error Handling

### Standard Error Response Format

**All applications MUST return errors in the following format:**

```json
{
  "errors": [
    {
      "errorCode": "JOB1001",
      "message": "Job not found",
      "type": "not_found",
      "category": "resource",
      "data": {
        "job_id": "123"
      }
    }
  ],
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "path": "/api/v1/jobs/123"
  }
}
```

### Error Response Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `errors` | Array | Yes | Array of error objects |
| `errors[].errorCode` | String | Yes | Unique error code (e.g., JOB1001) |
| `errors[].message` | String | Yes | Human-readable error message |
| `errors[].type` | String | Yes | Error type (validation_error, not_found, etc.) |
| `errors[].category` | String | Yes | Error category (input_validation, resource, etc.) |
| `errors[].data` | Object | No | Additional context-specific data |
| `meta` | Object | Yes | Metadata about the error |
| `meta.timestamp` | String | Yes | ISO 8601 timestamp |
| `meta.path` | String | Yes | API endpoint path |

### Error Types

```typescript
enum ErrorType {
  VALIDATION_ERROR = "validation_error",
  NOT_FOUND = "not_found",
  UNAUTHORIZED = "unauthorized",
  FORBIDDEN = "forbidden",
  CONFLICT = "conflict",
  INTERNAL_ERROR = "internal_error",
  EXTERNAL_SERVICE_ERROR = "external_service_error",
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
}
```

### Error Categories

```typescript
enum ErrorCategory {
  INPUT_VALIDATION = "input_validation",
  RESOURCE = "resource",
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  BUSINESS_LOGIC = "business_logic",
  SYSTEM = "system",
  EXTERNAL_SERVICE = "external_service",
  RATE_LIMITING = "rate_limiting"
}
```

### Backend Exception Handlers

**All backend APIs MUST implement custom exception handlers:**

```python
# FastAPI Example
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    field_errors = {}
    for error in exc.errors():
        field = ".".join(str(x) for x in error["loc"][1:])
        field_errors[field] = error["msg"]
    
    return JSONResponse(
        status_code=400,
        content={
            "errors": [{
                "errorCode": "VAL1000",
                "message": "Validation error",
                "type": "validation_error",
                "category": "input_validation",
                "data": {"fields": field_errors}
            }],
            "meta": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "path": request.url.path
            }
        }
    )
```

### Frontend Error Boundaries

**All frontend applications MUST implement error boundaries:**

```typescript
// React Example
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

**Error boundary features:**
- Catch JavaScript errors in component tree
- Log errors to monitoring service
- Display user-friendly fallback UI
- Provide retry mechanisms

### Frontend Error Handling Middleware

**All frontend HTTP clients MUST implement:**

1. **Request Interceptor**
   - Add request ID for tracing
   - Add authentication tokens
   - Log requests (development only)

2. **Response Interceptor**
   - Handle retry logic (502, 503, 504)
   - Transform errors to standard format
   - Log responses (development only)

```typescript
// Axios Example
client.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = uuidv4();
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (shouldRetry(error)) {
      return retryRequest(error.config);
    }
    return Promise.reject(transformError(error));
  }
);
```

### HTTP Status Code Error Pages

**All frontend applications MUST provide custom error pages:**

- **404 Not Found** - Page doesn't exist
- **500 Internal Server Error** - Generic error page
- **502 Bad Gateway** - Server temporarily unavailable
- **503 Service Unavailable** - Maintenance or overload

---

## API Design

### RESTful Conventions

**Follow REST principles for all APIs:**

| HTTP Method | Action | Example |
|-------------|--------|---------|
| GET | Retrieve resource(s) | `GET /api/v1/jobs` |
| POST | Create resource | `POST /api/v1/jobs` |
| PUT | Replace resource | `PUT /api/v1/jobs/123` |
| PATCH | Partial update | `PATCH /api/v1/jobs/123` |
| DELETE | Delete resource | `DELETE /api/v1/jobs/123` |

### URL Structure

```
/{api-prefix}/{version}/{resource}/{id}/{sub-resource}
```

**Examples:**
- `GET /api/v1/jobs` - List all jobs
- `GET /api/v1/jobs/123` - Get job by ID
- `POST /api/v1/jobs` - Create new job
- `DELETE /api/v1/jobs/bulk` - Bulk delete jobs
- `GET /api/v1/jobs/123/transcription` - Get job transcription

### Request/Response Format

**All APIs MUST:**
- Use JSON for request/response bodies
- Use camelCase for field names in frontend
- Use snake_case for field names in backend
- Include pagination for list endpoints
- Include filtering/sorting options

### Pagination

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

### API Versioning

**Use URL-based versioning:**
- `/api/v1/...` - Version 1
- `/api/v2/...` - Version 2

### Request/Response Headers

**Standard headers:**
- `Content-Type: application/json`
- `X-Request-ID: <uuid>` - Request tracing
- `Authorization: Bearer <token>` - Authentication
- `Accept-Language: en` - Localization

---

## Code Organization

### Project Structure

```
project/
├── src/
│   ├── api/          # API endpoints/routes
│   ├── services/     # Business logic
│   ├── models/       # Data models/schemas
│   ├── utils/        # Utility functions
│   ├── config/       # Configuration
│   └── tests/        # Test files
├── docs/             # Documentation
└── scripts/          # Build/deployment scripts
```

### File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `UserProfile.tsx` |
| Utilities | camelCase | `formatDate.ts` |
| Constants | UPPER_SNAKE_CASE | `API_BASE_URL` |
| Types/Interfaces | PascalCase | `User.ts` |
| Services | camelCase | `jobService.ts` |

### Import Organization

**Order imports as follows:**

1. External libraries
2. Internal modules
3. Types/interfaces
4. Styles/assets

```typescript
// External
import React from 'react';
import axios from 'axios';

// Internal
import { apiClient } from '@/services/api-client';
import { formatDate } from '@/utils/date';

// Types
import type { Job } from '@/types/job';

// Styles
import './styles.css';
```

### Code Comments

**Use JSDoc for functions/classes:**

```typescript
/**
 * Delete multiple jobs by their IDs
 * 
 * @param jobIds - Array of job IDs to delete
 * @returns Object with successful and failed job deletions
 * @throws {ApiError} If request fails
 * 
 * @example
 * ```typescript
 * const result = await bulkDeleteJobs(['123', '456']);
 * console.log(result.deleted_count); // 2
 * ```
 */
async function bulkDeleteJobs(jobIds: string[]): Promise<BulkDeleteResponse> {
  // Implementation
}
```

### Constants and Configuration

**Never hardcode values:**

```typescript
// ❌ Bad
const url = 'http://localhost:8000/api/v1/jobs';

// ✅ Good
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const API_VERSION = 'v1';
const url = `${BASE_URL}/api/${API_VERSION}/jobs`;
```

---

## Testing Standards

### Test Coverage

**Minimum coverage requirements:**
- Unit tests: 80%
- Integration tests: 70%
- E2E tests: Key user flows

### Test Structure

**Use AAA pattern (Arrange, Act, Assert):**

```typescript
describe('bulkDeleteJobs', () => {
  it('should delete multiple jobs successfully', async () => {
    // Arrange
    const jobIds = ['123', '456'];
    mockApi.onDelete('/jobs/bulk').reply(200, {
      deleted_count: 2,
      failed_jobs: []
    });
    
    // Act
    const result = await bulkDeleteJobs(jobIds);
    
    // Assert
    expect(result.deleted_count).toBe(2);
    expect(result.failed_jobs).toHaveLength(0);
  });
});
```

### Test Naming

```typescript
// Pattern: should [expected behavior] when [condition]
it('should return 404 when job does not exist', () => {});
it('should delete job when valid ID is provided', () => {});
it('should throw error when unauthorized', () => {});
```

### Mock Data

**Use factories or fixtures:**

```typescript
// test-utils/fixtures.ts
export const createMockJob = (overrides = {}) => ({
  id: '123',
  title: 'Test Job',
  status: 'completed',
  ...overrides
});
```

---

## Security Practices

### Input Validation

**Validate ALL inputs:**

```python
# Backend
from pydantic import BaseModel, validator

class JobCreate(BaseModel):
    title: str
    
    @validator('title')
    def validate_title(cls, v):
        if len(v) < 3:
            raise ValueError('Title must be at least 3 characters')
        return v
```

### Authentication & Authorization

**Implement proper auth checks:**

```python
# Backend
from fastapi import Depends, HTTPException
from app.dependencies import get_current_user

@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: int,
    current_user: User = Depends(get_current_user)
):
    # Check if user owns the job
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
```

### SQL Injection Prevention

**Use parameterized queries:**

```python
# ❌ Bad
query = f"SELECT * FROM jobs WHERE id = {job_id}"

# ✅ Good
query = select(Job).where(Job.id == job_id)
```

### XSS Prevention

**Sanitize user input:**

```typescript
// Frontend
import DOMPurify from 'dompurify';

const sanitized = DOMPurify.sanitize(userInput);
```

### Secrets Management

**Never commit secrets:**

```bash
# .env (not committed)
DATABASE_URL=postgresql://user:pass@localhost/db
API_KEY=secret-key-here

# .env.example (committed)
DATABASE_URL=postgresql://user:pass@localhost/db
API_KEY=your-api-key-here
```

---

## Performance Guidelines

### Database Queries

**Optimize queries:**

```python
# ❌ Bad - N+1 query
jobs = session.query(Job).all()
for job in jobs:
    user = session.query(User).filter(User.id == job.user_id).first()

# ✅ Good - Join
jobs = session.query(Job).join(User).all()
```

### API Response Size

**Paginate large responses:**

```python
@router.get("/jobs")
async def list_jobs(
    skip: int = 0,
    limit: int = Query(default=20, le=100)
):
    jobs = await job_service.list_jobs(skip=skip, limit=limit)
    return jobs
```

### Caching

**Cache expensive operations:**

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def get_expensive_data(key: str):
    # Expensive operation
    return data
```

### Frontend Optimization

**Implement lazy loading:**

```typescript
// React lazy loading
const JobsPage = lazy(() => import('./pages/Jobs'));

// Image lazy loading
<img loading="lazy" src={imageUrl} alt="..." />
```

---

## Documentation

### API Documentation

**Use OpenAPI/Swagger:**

```python
@router.post(
    "/jobs",
    response_model=JobResponse,
    summary="Create a new job",
    description="Creates a new transcription job with the provided details",
    responses={
        200: {"description": "Job created successfully"},
        400: {"description": "Invalid input"},
        401: {"description": "Unauthorized"}
    }
)
async def create_job(job: JobCreate):
    return await job_service.create(job)
```

### Code Documentation

**Document complex logic:**

```typescript
/**
 * Calculate the optimal chunk size for file upload
 * 
 * Uses adaptive algorithm based on:
 * - File size
 * - Network speed
 * - Device capabilities
 * 
 * @internal
 */
function calculateChunkSize(fileSize: number): number {
  // Complex logic here
}
```

### README Files

**Every module should have a README:**

```markdown
# Module Name

## Purpose
Brief description of what this module does

## Usage
Code examples

## API
List of public APIs

## Testing
How to run tests
```

---

## Version Control

### Commit Messages

**Use conventional commits:**

```
feat: add bulk delete functionality
fix: resolve job status update bug
docs: update API documentation
test: add integration tests for jobs
refactor: simplify error handling logic
chore: update dependencies
```

### Branch Naming

```
feature/bulk-delete-jobs
bugfix/job-status-update
hotfix/critical-security-patch
release/v1.2.0
```

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings generated
```

---

## References

- [CODING_STANDARDS.md](../CODING_STANDARDS.md) - Detailed coding standards
- [STANDARD_ERROR_FORMAT.md](../STANDARD_ERROR_FORMAT.md) - Error format specification
- [ERROR_GUIDE.md](../guides/ERROR_GUIDE.md) - Error handling guide
- [TESTING_HANDBOOK.md](./TESTING_HANDBOOK.md) - Testing guidelines

---

**Last Updated:** 2024-01-15
**Version:** 1.0.0
