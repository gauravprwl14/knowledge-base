# Error Handling Standardization - Implementation Summary

This document summarizes the comprehensive error handling standardization implemented across the Voice App platform.

## Overview

All error responses now follow a standardized format across backend and frontend applications. This ensures consistency, better debugging, and improved user experience.

## Standard Error Format

### Response Structure

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

### Field Descriptions

- **errors[]** - Array of error objects
- **errorCode** - Unique error identifier (e.g., JOB1001, VAL1000)
- **message** - Human-readable error message
- **type** - Error type (validation_error, not_found, etc.)
- **category** - Error category (input_validation, resource, etc.)
- **data** - Additional context-specific information
- **meta** - Metadata including timestamp and request path

---

## Backend Changes

### 1. Exception Handlers

**File:** [backend/app/main.py](../backend/app/main.py)

Added three custom exception handlers:

#### AppException Handler
Handles custom application exceptions with standard error format.

```python
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "errors": [{
                "errorCode": exc.error_code,
                "message": exc.detail or exc.error_definition.message,
                "type": exc.error_definition.type.value,
                "category": exc.error_definition.category.value,
                "data": exc.data or {}
            }],
            "meta": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "path": request.url.path
            }
        }
    )
```

#### RequestValidationError Handler
Converts Pydantic validation errors to standard format.

```python
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Extracts field errors from Pydantic validation
    field_errors = {}
    for error in exc.errors():
        field = ".".join(str(x) for x in error["loc"][1:])
        field_errors[field] = error["msg"]
    
    # Returns standard error format
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
            "meta": {...}
        }
    )
```

#### Generic Exception Handler
Catches all unexpected exceptions.

```python
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "errors": [{
                "errorCode": "SYS9000",
                "message": "Internal server error",
                "type": "internal_error",
                "category": "system",
                "data": {}
            }],
            "meta": {...}
        }
    )
```

### 2. Error Codes

**Standard Error Codes:**

| Code | Description | Type | Category |
|------|-------------|------|----------|
| VAL1000 | Validation error | validation_error | input_validation |
| JOB1001 | Job not found | not_found | resource |
| JOB1002 | Invalid job status | validation_error | input_validation |
| JOB1010 | Database error | internal_error | system |
| SYS9000 | Internal server error | internal_error | system |

### 3. Swagger Documentation

All API endpoints now document the standard error format in their responses.

---

## Frontend Changes

### 1. Request/Response Middleware

**File:** [frontend/services/api-client.ts](../frontend/services/api-client.ts)

Enhanced with comprehensive middleware:

#### Request Interceptor

```typescript
client.interceptors.request.use((config) => {
  // Add unique request ID for tracing
  config.headers['X-Request-ID'] = uuidv4();
  
  // Log request (development only)
  console.log(`[${requestId}] ${method} ${url}`);
  
  return config;
});
```

**Features:**
- Adds unique request ID (UUID) to every request
- Logs requests in development mode
- Tracks requests for debugging

#### Response Interceptor

```typescript
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Retry on 502, 503, 504
    if (shouldRetry(error)) {
      const retryCount = error.config._retryCount || 0;
      
      if (retryCount < maxRetries) {
        error.config._retryCount = retryCount + 1;
        await sleep(retryDelay * Math.pow(2, retryCount));
        return client.request(error.config);
      }
    }
    
    return Promise.reject(error);
  }
);
```

**Features:**
- Automatic retry for network errors (502, 503, 504)
- Exponential backoff (1s, 2s, 4s)
- Configurable max retries (default: 3)
- Logs all responses in development mode

### 2. Error Boundaries

**File:** [frontend/components/error-boundary.tsx](../frontend/components/error-boundary.tsx)

React Error Boundary component to catch component errors.

**Features:**
- Catches JavaScript errors in component tree
- Displays user-friendly fallback UI
- Provides retry mechanism
- Shows error details in development mode
- Logs errors to console

**Usage:**

```typescript
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

**Applied in:**
- Root layout: [app/[locale]/layout.tsx](../frontend/app/[locale]/layout.tsx)
- Wraps entire application

### 3. Error Pages

Created custom error pages for common HTTP errors:

#### 404 Not Found
**File:** [frontend/app/not-found.tsx](../frontend/app/not-found.tsx)

- Displays when page doesn't exist
- Provides "Go Home" and "Go Back" buttons

#### 500 Internal Server Error
**File:** [frontend/app/global-error.tsx](../frontend/app/global-error.tsx)

- Catches errors in root layout
- Provides "Try Again" button
- Shows error details in development

#### 502 Bad Gateway
**File:** [frontend/app/502.tsx](../frontend/app/502.tsx)

- Displays when server is temporarily unavailable
- Provides "Try Again" button
- Informs user to wait and retry

#### 503 Service Unavailable
**File:** [frontend/app/503.tsx](../frontend/app/503.tsx)

- Displays when service is down for maintenance
- Provides "Try Again" button
- Informs user about service status

### 4. Error Parsing

The frontend now correctly parses standard error responses:

```typescript
// lib/errors/types.ts
export function parseErrorResponse(error: AxiosError): ApiError {
  if (error.response?.data) {
    const data = error.response.data as any;
    
    // Parse standard error format
    if (data.errors && Array.isArray(data.errors)) {
      return {
        statusCode: error.response.status,
        message: data.errors[0].message,
        errors: data.errors
      };
    }
  }
  
  return {
    statusCode: error.response?.status || 500,
    message: error.message,
    errors: []
  };
}
```

---

## Documentation

Created comprehensive documentation:

### 1. Generic Coding Practices
**File:** [docs/guides/GENERIC_CODING_PRACTICES.md](./guides/GENERIC_CODING_PRACTICES.md)

Covers:
- Error handling standards
- API design conventions
- Code organization
- Testing standards
- Security practices
- Performance guidelines
- Documentation requirements
- Version control practices

### 2. Frontend Error Handling
**File:** [docs/guides/Frontend/ERROR_HANDLING.md](./guides/Frontend/ERROR_HANDLING.md)

Covers:
- Error types and parsing
- Error boundaries usage
- HTTP error handling
- Error pages
- Middleware implementation
- Best practices
- Complete examples

### 3. Backend Exception Handlers
**File:** [docs/guides/Backend/EXCEPTION_HANDLERS.md](./guides/Backend/EXCEPTION_HANDLERS.md)

Covers:
- Exception handler implementation
- Custom exceptions
- Validation errors
- HTTP exceptions
- Best practices
- Complete examples

### 4. Standard Error Format
**File:** [docs/STANDARD_ERROR_FORMAT.md](./STANDARD_ERROR_FORMAT.md)

Comprehensive specification of the standard error format with examples and validation scripts.

### 5. Coding Standards
**File:** [docs/CODING_STANDARDS.md](./CODING_STANDARDS.md)

Complete coding guidelines covering error handling, API design, testing, and more.

---

## Testing

### Backend Tests

Tests validate standard error format:

```python
# test_bulk_delete.py
def test_validation_error_format(self):
    response = client.post("/jobs/bulk/delete", json={})
    
    assert response.status_code == 400
    data = response.json()
    
    # Validate standard format
    assert "errors" in data
    assert len(data["errors"]) > 0
    
    error = data["errors"][0]
    assert "errorCode" in error
    assert "message" in error
    assert "type" in error
    assert "category" in error
    assert error["errorCode"] == "VAL1000"
```

### Frontend Tests

Tests handle standard errors:

```typescript
// job-service.test.ts
it('should handle standard error format', async () => {
  mockApi.onDelete('/jobs/bulk').reply(400, {
    errors: [{
      errorCode: 'JOB1001',
      message: 'Job not found',
      type: 'not_found',
      category: 'resource',
      data: { job_id: '123' }
    }],
    meta: {
      timestamp: '2024-01-15T10:30:00Z',
      path: '/api/v1/jobs/bulk'
    }
  });
  
  await expect(bulkDeleteJobs(['123'])).rejects.toThrow();
});
```

---

## Migration Guide

### For Developers

#### Before (Non-Standard Errors)

```python
# Backend
raise HTTPException(status_code=404, detail="Not found")

# Response
{
  "detail": "Not found"
}
```

```typescript
// Frontend
catch (error) {
  alert(error.message);
}
```

#### After (Standard Errors)

```python
# Backend
raise AppException(
  JobErrors.JOB_NOT_FOUND,
  detail="Job with ID 123 not found",
  data={"job_id": 123}
)

# Response
{
  "errors": [{
    "errorCode": "JOB1001",
    "message": "Job not found",
    "type": "not_found",
    "category": "resource",
    "data": {"job_id": 123}
  }],
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "path": "/api/v1/jobs/123"
  }
}
```

```typescript
// Frontend
catch (error) {
  const parsed = parseErrorResponse(error);
  
  // Log error details
  console.error('Error:', {
    code: parsed.errors[0].errorCode,
    message: parsed.errors[0].message,
    data: parsed.errors[0].data
  });
  
  // Show user-friendly message
  toast.error(parsed.message);
}
```

---

## Benefits

### 1. Consistency
- All errors follow the same format
- Easier to parse and handle
- Predictable error responses

### 2. Better Debugging
- Request IDs for tracing
- Detailed error context in `data` field
- Standardized error codes
- Comprehensive logging

### 3. Improved UX
- User-friendly error messages
- Custom error pages (404, 502, 503)
- Automatic retry for temporary failures
- Clear error communication

### 4. Type Safety
- TypeScript interfaces for error types
- Pydantic models for validation
- Type-safe error handling

### 5. Documentation
- Swagger docs show standard errors
- Comprehensive guides for developers
- Examples and best practices

---

## Next Steps

### Immediate
- ✅ Backend exception handlers implemented
- ✅ Frontend middleware and error boundaries added
- ✅ Error pages created (404, 502, 503)
- ✅ Documentation completed

### Future Enhancements
- [ ] Add error monitoring service (e.g., Sentry)
- [ ] Implement error analytics
- [ ] Add i18n support for error messages
- [ ] Create error tracking dashboard
- [ ] Add rate limiting with standard errors

---

## References

### Documentation
- [Generic Coding Practices](./guides/GENERIC_CODING_PRACTICES.md)
- [Frontend Error Handling](./guides/Frontend/ERROR_HANDLING.md)
- [Backend Exception Handlers](./guides/Backend/EXCEPTION_HANDLERS.md)
- [Standard Error Format](./STANDARD_ERROR_FORMAT.md)
- [Coding Standards](./CODING_STANDARDS.md)

### Code Files
- Backend: [app/main.py](../backend/app/main.py)
- Backend Errors: [app/utils/errors.py](../backend/app/utils/errors.py)
- Frontend API Client: [services/api-client.ts](../frontend/services/api-client.ts)
- Error Boundary: [components/error-boundary.tsx](../frontend/components/error-boundary.tsx)
- Error Pages: [app/not-found.tsx](../frontend/app/not-found.tsx), [app/502.tsx](../frontend/app/502.tsx), [app/503.tsx](../frontend/app/503.tsx)

---

**Implementation Date:** 2024-01-15
**Version:** 1.0.0
**Status:** Complete
