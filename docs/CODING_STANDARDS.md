# Coding Standards and Best Practices

## Table of Contents

1. [Error Handling Standards](#error-handling-standards)
2. [API Response Standards](#api-response-standards)
3. [Code Organization](#code-organization)
4. [Database Patterns](#database-patterns)
5. [Testing Standards](#testing-standards)
6. [Documentation Standards](#documentation-standards)
7. [Security Standards](#security-standards)
8. [Frontend Standards](#frontend-standards)
9. [Review Checklist](#review-checklist)

---

## Error Handling Standards

### 1. Standard Error Object Format

**MUST** use this format for ALL error responses:

```json
{
  "errorCode": "XXX1001",
  "message": "Human-readable error message",
  "type": "error_type",
  "category": "error_category",
  "data": {}
}
```

### Required Fields

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `errorCode` | ✅ REQUIRED | Three-letter prefix + 4 digits | `JOB1001`, `API2001` |
| `message` | ✅ REQUIRED | Human-readable description | `"Job not found or access denied"` |
| `type` | ✅ REQUIRED | Error type from ErrorType enum | `"not_found"`, `"validation_error"` |
| `category` | ✅ REQUIRED | Error category from ErrorCategory enum | `"resource"`, `"system"` |
| `data` | ⚠️ OPTIONAL | Additional metadata | `{"job_id": "123"}` |
| `statusCode` | ❌ SKIP | HTTP status code (redundant) | - |

### Error Type Enum

```python
class ErrorType(str, Enum):
    """Standard error types"""
    VALIDATION_ERROR = "validation_error"
    NOT_FOUND = "not_found"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    DATABASE_ERROR = "database_error"
    EXTERNAL_SERVICE_ERROR = "external_service_error"
    BUSINESS_RULE_VIOLATION = "business_rule_violation"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    INTERNAL_ERROR = "internal_error"
```

### Error Category Enum

```python
class ErrorCategory(str, Enum):
    """Standard error categories"""
    INPUT_VALIDATION = "input_validation"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    RESOURCE = "resource"
    BUSINESS_RULE_VIOLATION = "business_rule_violation"
    SYSTEM = "system"
    EXTERNAL_SERVICE = "external_service"
```

### Error Code Naming Convention

**Format**: `[PREFIX][NUMBER]`

- **Prefix**: 3 uppercase letters (e.g., `JOB`, `API`, `USR`, `TRN`)
- **Number**: 4 digits (e.g., `1001`, `2001`)

**Examples**:
- `JOB1001` - Job not found
- `API2001` - Invalid API key
- `TRN3001` - Transcription failed
- `USR4001` - User not found

### Error Code Ranges

| Range | Purpose | Example |
|-------|---------|---------|
| X001-X099 | Resource not found | `JOB1001` |
| X100-X199 | Validation errors | `JOB1100` |
| X200-X299 | Authorization errors | `JOB1200` |
| X300-X399 | Business rule violations | `JOB1300` |
| X400-X499 | Database errors | `JOB1400` |
| X500-X599 | External service errors | `JOB1500` |
| X900-X999 | Internal errors | `JOB1900` |

### Example: Defining Errors

```python
# app/utils/errors.py

class JobErrors:
    """Job-related error definitions"""
    
    # Resource errors (X001-X099)
    JOB1001 = ErrorDefinition(
        errorCode="JOB1001",
        statusCode=404,
        message="Job not found",
        type=ErrorType.NOT_FOUND,
        category=ErrorCategory.RESOURCE
    )
    
    # Validation errors (X100-X199)
    JOB1100 = ErrorDefinition(
        errorCode="JOB1100",
        statusCode=400,
        message="Invalid job status",
        type=ErrorType.VALIDATION_ERROR,
        category=ErrorCategory.INPUT_VALIDATION
    )
    
    # Authorization errors (X200-X299)
    JOB1200 = ErrorDefinition(
        errorCode="JOB1200",
        statusCode=403,
        message="Unauthorized access to job",
        type=ErrorType.FORBIDDEN,
        category=ErrorCategory.AUTHORIZATION
    )
```

### Example: Using Standard Errors in Responses

#### ❌ WRONG - Old Format
```python
{
    "job_id": "123",
    "error": "Job not found"
}
```

#### ✅ CORRECT - Standard Format
```python
{
    "errorCode": "JOB1001",
    "message": "Job not found or access denied",
    "type": "not_found",
    "category": "resource",
    "data": {
        "job_id": "123",
        "original_filename": "audio.mp3"
    }
}
```

### Example: Partial Success Responses

When operations partially succeed, failed items **MUST** use the standard error object:

```python
{
    "deleted_count": 8,
    "failed_count": 2,
    "failed_jobs": [
        {
            "errorCode": "JOB1001",
            "message": "Job not found or access denied",
            "type": "not_found",
            "category": "resource",
            "data": {
                "job_id": "550e8400-e29b-41d4-a716-446655440008"
            }
        },
        {
            "errorCode": "JOB1010",
            "message": "Database constraint violation",
            "type": "database_error",
            "category": "system",
            "data": {
                "job_id": "550e8400-e29b-41d4-a716-446655440009"
            }
        }
    ]
}
```

### Creating AppException

```python
# Simple error
raise AppException(JobErrors.JOB1001)

# With custom detail
raise AppException(
    JobErrors.JOB1001,
    detail="Job 123 not found in database"
)

# With additional data
raise AppException(
    JobErrors.JOB1001,
    detail="Job not found",
    data={"job_id": "123", "user_id": "456"}
)
```

---

## API Response Standards

### Success Response Format

```json
{
  "data": { /* actual data */ },
  "meta": {
    "timestamp": "2026-01-07T10:00:00Z",
    "request_id": "req_123"
  }
}
```

### List Response Format

```json
{
  "items": [ /* array of items */ ],
  "total": 100,
  "page": 1,
  "page_size": 20,
  "meta": {
    "timestamp": "2026-01-07T10:00:00Z"
  }
}
```

### Error Response Format

```json
{
  "errors": [
    {
      "errorCode": "JOB1001",
      "message": "Job not found",
      "type": "not_found",
      "category": "resource",
      "data": {}
    }
  ],
  "meta": {
    "timestamp": "2026-01-07T10:00:00Z",
    "request_id": "req_123"
  }
}
```

### HTTP Status Codes

| Code | Use Case | Example |
|------|----------|---------|
| 200 | Success (including partial success) | Bulk delete with some failures |
| 201 | Resource created | Job created |
| 204 | Success with no content | Delete operation |
| 400 | Validation error | Invalid UUID format |
| 401 | Authentication required | Missing API key |
| 403 | Forbidden | Access denied |
| 404 | Resource not found | Job not found |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable entity | Business rule violation |
| 429 | Rate limit exceeded | Too many requests |
| 500 | Internal server error | Database error |
| 503 | Service unavailable | External service down |

---

## Code Organization

### Directory Structure

```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       └── endpoints/       # API endpoints
│   ├── db/
│   │   ├── models.py           # SQLAlchemy models
│   │   └── session.py          # Database session
│   ├── schemas/                # Pydantic schemas
│   ├── services/               # Business logic
│   ├── utils/
│   │   ├── errors.py           # Error definitions
│   │   └── helpers.py          # Utility functions
│   ├── workers/                # Background workers
│   ├── config.py               # Configuration
│   └── main.py                 # FastAPI app
└── tests/
    ├── unit/                   # Unit tests
    ├── integration/            # Integration tests
    └── e2e/                    # End-to-end tests
```

### Service Layer Pattern

**MUST** use service layer for business logic:

```python
# ❌ WRONG - Business logic in endpoint
@router.post("/jobs")
async def create_job(db: DbSession):
    job = Job(...)
    db.add(job)
    await db.commit()
    # Delete files, update status, etc...
    return job

# ✅ CORRECT - Business logic in service
@router.post("/jobs")
async def create_job(db: DbSession):
    return await JobService.create_job(db, ...)

# app/services/job_service.py
class JobService:
    @staticmethod
    async def create_job(db: AsyncSession, ...) -> Job:
        # All business logic here
        job = Job(...)
        db.add(job)
        await db.commit()
        # Delete files, update status, etc...
        return job
```

---

## Database Patterns

### Transaction Handling

```python
# ✅ CORRECT - Explicit transaction
async def bulk_operation(db: AsyncSession, items: List):
    try:
        for item in items:
            # Process item
            pass
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise AppException(...)
```

### Query Patterns

```python
# ✅ Use select() for queries
result = await db.execute(
    select(Job)
    .where(Job.id == job_id)
    .options(selectinload(Job.transcription))
)
job = result.scalar_one_or_none()

# ✅ Check for None
if not job:
    raise AppException(JobErrors.JOB1001)
```

### Model Relationships

```python
# ✅ Use selectinload for relationships
result = await db.execute(
    select(Job).options(
        selectinload(Job.transcription),
        selectinload(Job.translations)
    )
)
```

---

## Testing Standards

### Test Structure

```python
class TestFeatureName:
    """Group related tests"""
    
    @pytest.mark.asyncio
    async def test_success_case(self):
        """Test description"""
        # Arrange
        data = create_test_data()
        
        # Act
        result = await service.method(data)
        
        # Assert
        assert result.status == "success"
    
    @pytest.mark.asyncio
    async def test_error_case(self):
        """Test error handling"""
        with pytest.raises(AppException) as exc:
            await service.method(invalid_data)
        
        assert exc.value.error_code == "JOB1001"
```

### Test Coverage Requirements

- **Unit Tests**: 90%+ coverage
- **Integration Tests**: Critical paths
- **E2E Tests**: User workflows

### Test Naming

```python
# ✅ CORRECT
def test_bulk_delete_partial_success()
def test_bulk_delete_empty_list_raises_error()
def test_bulk_delete_unauthorized_access()

# ❌ WRONG
def test_1()
def test_bulk_delete()
def test_error()
```

---

## Documentation Standards

### Docstrings

```python
def function_name(param1: str, param2: int) -> Dict[str, Any]:
    """
    Brief description of what the function does.
    
    Detailed explanation if needed. Can span multiple lines
    and include examples.
    
    Args:
        param1: Description of param1
        param2: Description of param2
    
    Returns:
        Dict containing:
        - key1: Description
        - key2: Description
    
    Raises:
        AppException: When validation fails (JOB1001)
        ValueError: When param2 is negative
    
    Example:
        >>> result = function_name("test", 42)
        >>> print(result["key1"])
    """
```

### API Endpoint Documentation

```python
@router.post(
    "/endpoint",
    summary="Brief title",
    description="""
    Detailed description with markdown support.
    
    **Features:**
    - Feature 1
    - Feature 2
    
    **Error Codes:**
    - JOB1001: Job not found
    - JOB1007: Empty list
    """,
    response_model=ResponseModel,
    responses={
        200: {"description": "Success"},
        400: {"description": "Validation error"},
        404: {"description": "Not found"}
    },
    tags=["Category"]
)
```

### Code Comments

```python
# ✅ CORRECT - Explain WHY, not WHAT
# Cancel processing jobs first to avoid race conditions
if job.status == JobStatus.PROCESSING:
    job.status = JobStatus.CANCELLED

# ❌ WRONG - States the obvious
# Set job status to cancelled
job.status = JobStatus.CANCELLED
```

---

## Security Standards

### API Key Validation

```python
# ✅ Always verify API key
@router.get("/jobs")
async def list_jobs(
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    # api_key is validated by dependency
    query = select(Job).where(Job.api_key_id == api_key.id)
```

### SQL Injection Prevention

```python
# ✅ CORRECT - Parameterized queries
query = select(Job).where(Job.id == job_id)

# ❌ WRONG - String concatenation
query = f"SELECT * FROM jobs WHERE id = '{job_id}'"
```

### File Path Validation

```python
# ✅ CORRECT - Validate file paths
if not file_path.startswith(ALLOWED_UPLOAD_DIR):
    raise AppException(FileErrors.INVALID_PATH)
```

---

## Frontend Standards

### Error Handling

```typescript
// ✅ CORRECT - Use standard error parsing
try {
  await JobService.deleteJob(jobId);
} catch (error) {
  const appError = parseErrorResponse(error);
  
  // Check error code for specific handling
  if (appError.errorCode === 'JOB1001') {
    // Handle not found
  }
  
  // Log for debugging
  logError('DeleteJob', appError);
  
  // Show user-friendly message
  toast({
    title: 'Error',
    description: getErrorMessage(appError),
    variant: 'destructive',
  });
}
```

### Service Layer

```typescript
// ✅ CORRECT - Centralized API calls
class JobService {
  static async deleteJob(jobId: string): Promise<void> {
    return apiClient.delete(`/api/v1/jobs/${jobId}`);
  }
}

// Use in components
await JobService.deleteJob(jobId);
```

---

## Review Checklist

### Before Committing

- [ ] **Error Handling**: All errors use standard error object format
- [ ] **Error Codes**: Follow naming convention (PREFIX + 4 digits)
- [ ] **Required Fields**: errorCode, message, type, category present
- [ ] **Optional Data**: Metadata added to `data` field when relevant
- [ ] **Service Layer**: Business logic in service, not endpoint
- [ ] **Transaction Handling**: Explicit commit/rollback
- [ ] **Documentation**: Docstrings and API docs updated
- [ ] **Tests**: Unit tests cover success and error cases
- [ ] **Type Hints**: All functions have type annotations
- [ ] **Logging**: Errors logged with appropriate level
- [ ] **Security**: API key validation, SQL injection prevention

### Code Review Questions

1. **Error Format**: Does this follow the standard error object?
2. **Error Code**: Is the error code unique and properly named?
3. **Service Layer**: Is business logic in the service layer?
4. **Testing**: Are there tests for both success and error cases?
5. **Documentation**: Is the API endpoint properly documented?
6. **Security**: Are inputs validated and sanitized?
7. **Performance**: Are database queries optimized?
8. **Consistency**: Does this match existing patterns?

---

## Implementation Checklist

### Adding a New Feature

1. **Define Errors**
   ```python
   # app/utils/errors.py
   class FeatureErrors:
       FEATURE1001 = ErrorDefinition(...)
   ```

2. **Create Service**
   ```python
   # app/services/feature_service.py
   class FeatureService:
       @staticmethod
       async def method(...):
           # Business logic
           pass
   ```

3. **Create Schemas**
   ```python
   # app/schemas/feature.py
   class FeatureRequest(BaseModel):
       pass
   
   class FeatureResponse(BaseModel):
       pass
   ```

4. **Create Endpoint**
   ```python
   # app/api/v1/endpoints/feature.py
   @router.post("/feature")
   async def create_feature(...):
       return await FeatureService.method(...)
   ```

5. **Add Tests**
   ```python
   # tests/unit/services/test_feature_service.py
   class TestFeatureService:
       async def test_success(self):
           pass
       
       async def test_error(self):
           pass
   ```

6. **Document**
   - Add docstrings
   - Update API docs
   - Add examples to Swagger

### Error Code Registration

Keep a central registry of all error codes:

```python
# app/utils/error_registry.py

ERROR_CODE_REGISTRY = {
    # Job errors (JOB1xxx)
    "JOB1001": "Job not found",
    "JOB1002": "Unauthorized job access",
    "JOB1007": "Empty job list",
    "JOB1008": "Bulk limit exceeded",
    "JOB1010": "Database error",
    
    # API errors (API2xxx)
    "API2001": "Invalid API key",
    "API2002": "API key expired",
    
    # Add more...
}

# Validate no duplicates
assert len(ERROR_CODE_REGISTRY) == len(set(ERROR_CODE_REGISTRY.keys()))
```

---

## Common Pitfalls

### ❌ WRONG: Non-Standard Error Format

```python
return {
    "error": "Job not found",
    "job_id": "123"
}
```

### ✅ CORRECT: Standard Error Format

```python
raise AppException(
    JobErrors.JOB1001,
    data={"job_id": "123"}
)
```

### ❌ WRONG: Business Logic in Endpoint

```python
@router.post("/jobs")
async def create_job(db: DbSession):
    job = Job(...)
    db.add(job)
    await db.commit()
    return job
```

### ✅ CORRECT: Business Logic in Service

```python
@router.post("/jobs")
async def create_job(db: DbSession):
    return await JobService.create_job(db, ...)
```

### ❌ WRONG: Missing Error Code

```python
failed_jobs.append({
    "message": "Failed to delete",
    "job_id": "123"
})
```

### ✅ CORRECT: Complete Error Object

```python
failed_jobs.append({
    "errorCode": "JOB1001",
    "message": "Job not found or access denied",
    "type": "not_found",
    "category": "resource",
    "data": {"job_id": "123"}
})
```

---

## Tools and Automation

### Pre-commit Hooks

```bash
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: error-format-check
        name: Check error format
        entry: python scripts/check_error_format.py
        language: system
```

### Linting Rules

```python
# pylint: disable=W0511
# TODO: Use AppException instead of raising generic Exception
```

### Error Code Validator

```python
# scripts/validate_error_codes.py
import re
from app.utils.errors import *

def validate_error_codes():
    """Ensure all error codes follow the standard"""
    pattern = re.compile(r'^[A-Z]{3}\d{4}$')
    
    for error_class in [JobErrors, APIErrors, UserErrors]:
        for attr in dir(error_class):
            if attr.startswith('_'):
                continue
            error_def = getattr(error_class, attr)
            if hasattr(error_def, 'errorCode'):
                assert pattern.match(error_def.errorCode), \
                    f"Invalid error code: {error_def.errorCode}"
```

---

## Summary

### Must-Follow Rules

1. **✅ Standard Error Object**: errorCode, message, type, category, data
2. **✅ Error Code Format**: PREFIX + 4 digits (e.g., JOB1001)
3. **✅ Service Layer**: Business logic in services, not endpoints
4. **✅ Transaction Handling**: Explicit commit/rollback
5. **✅ Documentation**: Docstrings and API docs for all endpoints
6. **✅ Testing**: Unit tests for success and error cases
7. **✅ Type Hints**: All functions have type annotations
8. **✅ Security**: API key validation, input sanitization

### Key Benefits

- **Consistency**: Uniform error handling across the application
- **Debugging**: Easy to track errors with unique codes
- **Client-Friendly**: Standard format for frontend error parsing
- **Maintainability**: Clear separation of concerns
- **Documentation**: Self-documenting code with proper types
- **Testing**: Comprehensive test coverage

### Quick Reference

| Standard | Format | Example |
|----------|--------|---------|
| Error Object | `{errorCode, message, type, category, data}` | See above |
| Error Code | `XXX1234` | `JOB1001` |
| Error Type | Enum value | `not_found` |
| Error Category | Enum value | `resource` |
| Service Pattern | Static methods | `JobService.method()` |
| API Response | `{data, meta}` | See above |

---

**Last Updated**: January 7, 2026  
**Version**: 1.0.0  
**Status**: Active
