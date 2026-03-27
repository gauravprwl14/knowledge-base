# Backend Exception Handlers Guide

This guide covers exception handling best practices for the Voice App backend API.

## Table of Contents

1. [Overview](#overview)
2. [Exception Handlers](#exception-handlers)
3. [Custom Exceptions](#custom-exceptions)
4. [Validation Errors](#validation-errors)
5. [HTTP Exceptions](#http-exceptions)
6. [Best Practices](#best-practices)

---

## Overview

The backend implements custom exception handlers to ensure all errors follow the standard error format:

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

---

## Exception Handlers

### Implementation

**Location:** [backend/app/main.py](../../backend/app/main.py)

The FastAPI app registers three custom exception handlers:

1. **AppException Handler** - Custom application exceptions
2. **RequestValidationError Handler** - Pydantic validation errors
3. **Generic Exception Handler** - Unexpected errors

### AppException Handler

Handles custom application exceptions:

```python
from app.utils.errors import AppException

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handle custom AppException with standard error format"""
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

### RequestValidationError Handler

Handles Pydantic validation errors:

```python
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors with standard error format"""
    # Extract field errors
    field_errors = {}
    for error in exc.errors():
        field = ".".join(str(x) for x in error["loc"][1:])  # Skip 'body'
        field_errors[field] = error["msg"]
    
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "errors": [{
                "errorCode": "VAL1000",
                "message": "Validation error",
                "type": ErrorType.VALIDATION_ERROR.value,
                "category": ErrorCategory.INPUT_VALIDATION.value,
                "data": {
                    "fields": field_errors
                }
            }],
            "meta": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "path": request.url.path
            }
        }
    )
```

### Generic Exception Handler

Handles unexpected exceptions:

```python
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions with standard error format"""
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "errors": [{
                "errorCode": "SYS9000",
                "message": "Internal server error",
                "type": ErrorType.INTERNAL_ERROR.value,
                "category": ErrorCategory.SYSTEM.value,
                "data": {}
            }],
            "meta": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "path": request.url.path
            }
        }
    )
```

---

## Custom Exceptions

### Defining Custom Exceptions

**Location:** [backend/app/utils/errors.py](../../backend/app/utils/errors.py)

```python
from enum import Enum
from typing import Optional, Dict, Any
from fastapi import HTTPException, status

class ErrorType(str, Enum):
    """Standard error types"""
    VALIDATION_ERROR = "validation_error"
    NOT_FOUND = "not_found"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    CONFLICT = "conflict"
    INTERNAL_ERROR = "internal_error"

class ErrorCategory(str, Enum):
    """Standard error categories"""
    INPUT_VALIDATION = "input_validation"
    RESOURCE = "resource"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    BUSINESS_LOGIC = "business_logic"
    SYSTEM = "system"

class ErrorDefinition:
    """Defines an error with code, message, type, and category"""
    def __init__(
        self,
        code: str,
        message: str,
        type: ErrorType,
        category: ErrorCategory,
        status_code: int = status.HTTP_400_BAD_REQUEST
    ):
        self.code = code
        self.message = message
        self.type = type
        self.category = category
        self.status_code = status_code

class AppException(HTTPException):
    """Custom exception with standard error format"""
    def __init__(
        self,
        error_definition: ErrorDefinition,
        detail: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            status_code=error_definition.status_code,
            detail=detail or error_definition.message
        )
        self.error_definition = error_definition
        self.error_code = error_definition.code
        self.data = data or {}
```

### Error Definitions

Define reusable error definitions:

```python
class JobErrors:
    """Job-related error definitions"""
    
    JOB_NOT_FOUND = ErrorDefinition(
        code="JOB1001",
        message="Job not found",
        type=ErrorType.NOT_FOUND,
        category=ErrorCategory.RESOURCE,
        status_code=status.HTTP_404_NOT_FOUND
    )
    
    JOB_INVALID_STATUS = ErrorDefinition(
        code="JOB1002",
        message="Invalid job status",
        type=ErrorType.VALIDATION_ERROR,
        category=ErrorCategory.INPUT_VALIDATION,
        status_code=status.HTTP_400_BAD_REQUEST
    )
    
    JOB_DATABASE_ERROR = ErrorDefinition(
        code="JOB1010",
        message="Database error while processing job",
        type=ErrorType.INTERNAL_ERROR,
        category=ErrorCategory.SYSTEM,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
```

### Raising Custom Exceptions

Use `AppException` to raise errors:

```python
from app.utils.errors import AppException, JobErrors

async def get_job(job_id: int):
    job = await db.get(Job, job_id)
    
    if not job:
        raise AppException(
            JobErrors.JOB_NOT_FOUND,
            detail=f"Job with ID {job_id} not found",
            data={"job_id": job_id}
        )
    
    return job
```

---

## Validation Errors

### Pydantic Validation

Pydantic automatically validates request bodies:

```python
from pydantic import BaseModel, validator

class JobCreate(BaseModel):
    title: str
    description: Optional[str] = None
    
    @validator('title')
    def validate_title(cls, v):
        if len(v) < 3:
            raise ValueError('Title must be at least 3 characters')
        if len(v) > 100:
            raise ValueError('Title must be at most 100 characters')
        return v

@router.post("/jobs")
async def create_job(job: JobCreate):
    # If validation fails, RequestValidationError is raised
    # and handled by validation_exception_handler
    return await job_service.create(job)
```

### Validation Error Response

When validation fails, the response looks like:

```json
{
  "errors": [{
    "errorCode": "VAL1000",
    "message": "Validation error",
    "type": "validation_error",
    "category": "input_validation",
    "data": {
      "fields": {
        "title": "Title must be at least 3 characters",
        "status": "field required"
      }
    }
  }],
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "path": "/api/v1/jobs"
  }
}
```

### Custom Validators

Create custom validators for complex validation:

```python
from pydantic import validator, root_validator

class BulkDeleteRequest(BaseModel):
    job_ids: List[int]
    
    @validator('job_ids')
    def validate_job_ids(cls, v):
        if len(v) == 0:
            raise ValueError('At least one job ID is required')
        if len(v) > 100:
            raise ValueError('Cannot delete more than 100 jobs at once')
        if len(v) != len(set(v)):
            raise ValueError('Duplicate job IDs found')
        return v
    
    @root_validator
    def validate_request(cls, values):
        # Validate relationships between fields
        return values
```

---

## HTTP Exceptions

### Using HTTPException

For simple HTTP errors:

```python
from fastapi import HTTPException, status

@router.get("/jobs/{job_id}")
async def get_job(job_id: int):
    job = await db.get(Job, job_id)
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    return job
```

**Note:** `HTTPException` does NOT follow the standard error format. Use `AppException` instead.

### Standard HTTP Status Codes

Use appropriate status codes:

| Status Code | Description | When to Use |
|------------|-------------|-------------|
| 200 OK | Success | Successful GET, PUT, PATCH |
| 201 Created | Resource created | Successful POST |
| 204 No Content | Success, no body | Successful DELETE |
| 400 Bad Request | Invalid input | Validation errors |
| 401 Unauthorized | Not authenticated | Missing/invalid auth |
| 403 Forbidden | Not authorized | Insufficient permissions |
| 404 Not Found | Resource not found | Resource doesn't exist |
| 409 Conflict | Conflict | Duplicate resource |
| 422 Unprocessable Entity | Semantic error | Business logic error |
| 500 Internal Server Error | Server error | Unexpected errors |
| 502 Bad Gateway | Gateway error | External service error |
| 503 Service Unavailable | Service down | Maintenance/overload |

---

## Best Practices

### 1. Always Use AppException

```python
# ✅ Good - Standard error format
raise AppException(
    JobErrors.JOB_NOT_FOUND,
    data={"job_id": job_id}
)

# ❌ Bad - Non-standard format
raise HTTPException(status_code=404, detail="Not found")
```

### 2. Provide Meaningful Error Messages

```python
# ✅ Good - Specific message
raise AppException(
    JobErrors.JOB_NOT_FOUND,
    detail=f"Job with ID {job_id} not found",
    data={"job_id": job_id}
)

# ❌ Bad - Generic message
raise AppException(JobErrors.JOB_NOT_FOUND)
```

### 3. Include Context in Error Data

```python
# ✅ Good - Includes context
raise AppException(
    JobErrors.JOB_INVALID_STATUS,
    detail=f"Cannot transition from {current_status} to {new_status}",
    data={
        "job_id": job_id,
        "current_status": current_status,
        "requested_status": new_status
    }
)

# ❌ Bad - No context
raise AppException(JobErrors.JOB_INVALID_STATUS)
```

### 4. Log Errors Before Raising

```python
# ✅ Good - Log with context
logger.error(
    f"Failed to delete job {job_id}",
    extra={"job_id": job_id, "error": str(e)}
)
raise AppException(JobErrors.JOB_DATABASE_ERROR, data={"job_id": job_id})

# ❌ Bad - No logging
raise AppException(JobErrors.JOB_DATABASE_ERROR)
```

### 5. Handle Database Errors

```python
# ✅ Good - Catch and handle
try:
    result = await db.execute(query)
except SQLAlchemyError as e:
    logger.error(f"Database error: {e}", exc_info=True)
    raise AppException(
        JobErrors.JOB_DATABASE_ERROR,
        detail="Failed to query database",
        data={"operation": "delete_job"}
    )

# ❌ Bad - Let error propagate
result = await db.execute(query)
```

### 6. Validate Early

```python
# ✅ Good - Validate early
@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int, current_user: User = Depends(get_current_user)):
    # Check if job exists
    job = await get_job_or_404(job_id)
    
    # Check permissions
    if job.owner_id != current_user.id:
        raise AppException(JobErrors.JOB_FORBIDDEN)
    
    # Perform deletion
    await job_service.delete(job_id)

# ❌ Bad - Validate late
async def delete_job(job_id: int):
    await job_service.delete(job_id)  # Might fail with unclear error
```

### 7. Use Consistent Error Codes

```python
# ✅ Good - Use predefined errors
raise AppException(JobErrors.JOB_NOT_FOUND, data={"job_id": job_id})

# ❌ Bad - Define inline
raise AppException(
    ErrorDefinition(
        code="JOB9999",
        message="Job not found",
        type=ErrorType.NOT_FOUND,
        category=ErrorCategory.RESOURCE
    )
)
```

### 8. Document Error Responses in Swagger

```python
@router.get(
    "/jobs/{job_id}",
    responses={
        200: {"description": "Job retrieved successfully"},
        404: {
            "description": "Job not found",
            "content": {
                "application/json": {
                    "example": {
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
                }
            }
        }
    }
)
async def get_job(job_id: int):
    return await job_service.get(job_id)
```

---

## Examples

### Complete Error Handling Flow

```python
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
import logging

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.job import Job
from app.schemas.job import JobResponse
from app.utils.errors import AppException, JobErrors

logger = logging.getLogger(__name__)
router = APIRouter()

@router.delete(
    "/jobs/{job_id}",
    response_model=JobResponse,
    status_code=status.HTTP_200_OK,
    responses={
        404: {"description": "Job not found"},
        403: {"description": "Forbidden"},
        500: {"description": "Internal server error"}
    }
)
async def delete_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a job by ID
    
    - Validates job exists
    - Checks user permissions
    - Deletes job and associated files
    - Returns deleted job details
    """
    try:
        # Get job
        job = await db.get(Job, job_id)
        
        if not job:
            logger.warning(f"Job {job_id} not found")
            raise AppException(
                JobErrors.JOB_NOT_FOUND,
                detail=f"Job with ID {job_id} not found",
                data={"job_id": job_id}
            )
        
        # Check permissions
        if job.owner_id != current_user.id:
            logger.warning(
                f"User {current_user.id} attempted to delete job {job_id}"
            )
            raise AppException(
                JobErrors.JOB_FORBIDDEN,
                detail="You do not have permission to delete this job",
                data={"job_id": job_id}
            )
        
        # Delete associated files
        try:
            await delete_job_files(job)
        except Exception as e:
            logger.error(f"Failed to delete files for job {job_id}: {e}")
            # Continue with job deletion even if file deletion fails
        
        # Delete job
        await db.delete(job)
        await db.commit()
        
        logger.info(f"Successfully deleted job {job_id}")
        return job
        
    except AppException:
        # Re-raise custom exceptions
        raise
        
    except SQLAlchemyError as e:
        # Handle database errors
        logger.error(f"Database error deleting job {job_id}: {e}", exc_info=True)
        await db.rollback()
        raise AppException(
            JobErrors.JOB_DATABASE_ERROR,
            detail="Failed to delete job from database",
            data={"job_id": job_id, "operation": "delete"}
        )
        
    except Exception as e:
        # Handle unexpected errors
        logger.error(f"Unexpected error deleting job {job_id}: {e}", exc_info=True)
        await db.rollback()
        raise AppException(
            JobErrors.JOB_DELETE_FAILED,
            detail="An unexpected error occurred while deleting the job",
            data={"job_id": job_id}
        )
```

---

## References

- [Main App](../../backend/app/main.py) - Exception handlers
- [Error Utils](../../backend/app/utils/errors.py) - Error definitions
- [Standard Error Format](../STANDARD_ERROR_FORMAT.md)
- [Error Guide](../guides/ERROR_GUIDE.md)

---

**Last Updated:** 2024-01-15
**Version:** 1.0.0
