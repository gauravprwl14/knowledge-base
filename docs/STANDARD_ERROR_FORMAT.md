# Standard Error Object - Quick Reference

## Required Format

```json
{
  "errorCode": "JOB1001",
  "message": "Human-readable error message",
  "type": "not_found",
  "category": "resource",
  "data": {}
}
```

## Field Descriptions

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `errorCode` | ✅ YES | string | Unique error identifier | `"JOB1001"` |
| `message` | ✅ YES | string | Human-readable description | `"Job not found or access denied"` |
| `type` | ✅ YES | string | Error type from ErrorType enum | `"not_found"` |
| `category` | ✅ YES | string | Error category from ErrorCategory enum | `"resource"` |
| `data` | ⚠️ OPTIONAL | object | Additional metadata | `{"job_id": "123"}` |

## Error Types

```python
validation_error      # Input validation failed
not_found            # Resource not found
unauthorized         # Authentication required
forbidden            # Access denied
database_error       # Database operation failed
external_service_error  # External API failed
business_rule_violation # Business rule violated
rate_limit_exceeded  # Too many requests
internal_error       # Unexpected server error
```

## Error Categories

```python
input_validation     # Invalid input data
authentication       # Auth token/key issues
authorization        # Permission issues
resource            # Resource not found
business_rule_violation # Business logic violation
system              # Database/server errors
external_service    # Third-party service errors
```

## Error Code Format

**Pattern**: `[PREFIX][NUMBER]`

- **Prefix**: 3 uppercase letters (e.g., `JOB`, `API`, `USR`)
- **Number**: 4 digits (e.g., `1001`, `2001`)

**Examples**:
- `JOB1001` - Job not found
- `API2001` - Invalid API key
- `USR3001` - User not found

## Code Ranges

| Range | Purpose |
|-------|---------|
| X001-X099 | Resource not found errors |
| X100-X199 | Validation errors |
| X200-X299 | Authorization errors |
| X300-X399 | Business rule violations |
| X400-X499 | Database errors |
| X500-X599 | External service errors |
| X900-X999 | Internal errors |

## Usage Examples

### Backend (Python)

#### Raising Errors

```python
# Simple error
raise AppException(JobErrors.JOB1001)

# With custom detail
raise AppException(
    JobErrors.JOB1001,
    detail="Job 123 not found"
)

# With metadata
raise AppException(
    JobErrors.JOB1001,
    data={
        "job_id": "123",
        "user_id": "456"
    }
)
```

#### Returning Error Objects

```python
# In partial success responses
failed_jobs.append({
    "errorCode": "JOB1001",
    "message": "Job not found or access denied",
    "type": "not_found",
    "category": "resource",
    "data": {
        "job_id": str(job_id),
        "original_filename": filename
    }
})
```

### Frontend (TypeScript)

#### Parsing Errors

```typescript
import { parseErrorResponse, getErrorMessage } from '@/lib/errors';

try {
  await JobService.deleteJob(jobId);
} catch (error) {
  const appError = parseErrorResponse(error);
  
  // Access error properties
  console.log(appError.errorCode);  // "JOB1001"
  console.log(appError.message);     // "Job not found"
  console.log(appError.type);        // "not_found"
  console.log(appError.category);    // "resource"
  console.log(appError.data);        // { job_id: "123" }
}
```

#### Handling Specific Errors

```typescript
try {
  await JobService.deleteJob(jobId);
} catch (error) {
  const appError = parseErrorResponse(error);
  
  if (appError.errorCode === 'JOB1001') {
    // Handle not found
    router.push('/jobs');
  } else if (appError.errorCode === 'JOB1002') {
    // Handle unauthorized
    showLogin();
  } else {
    // Generic error handling
    toast.error(getErrorMessage(appError));
  }
}
```

#### Handling Partial Success

```typescript
const result = await JobService.bulkDeleteJobs(jobIds);

if (result.failed_count > 0) {
  // Process failed jobs
  result.failed_jobs.forEach((failure) => {
    console.error(
      `Error ${failure.errorCode}: ${failure.message}`,
      failure.data
    );
  });
}
```

## Complete Examples

### Example 1: Single Error Response

```json
{
  "errors": [
    {
      "errorCode": "JOB1001",
      "message": "Job not found or access denied",
      "type": "not_found",
      "category": "resource",
      "data": {
        "job_id": "550e8400-e29b-41d4-a716-446655440000"
      }
    }
  ]
}
```

### Example 2: Validation Error with Multiple Fields

```json
{
  "errors": [
    {
      "errorCode": "JOB1100",
      "message": "Invalid job data",
      "type": "validation_error",
      "category": "input_validation",
      "data": {
        "fields": {
          "model_name": "Required field",
          "provider": "Must be one of: whisper, deepgram"
        }
      }
    }
  ]
}
```

### Example 3: Partial Bulk Delete

```json
{
  "deleted_count": 8,
  "failed_count": 2,
  "total_requested": 10,
  "deleted_jobs": [
    {"job_id": "...", "status": "deleted"}
  ],
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
        "job_id": "550e8400-e29b-41d4-a716-446655440009",
        "constraint": "fk_transcription_job"
      }
    }
  ]
}
```

## Common Mistakes

### ❌ WRONG: Missing Required Fields

```json
{
  "error": "Job not found",
  "job_id": "123"
}
```

### ✅ CORRECT: Complete Error Object

```json
{
  "errorCode": "JOB1001",
  "message": "Job not found",
  "type": "not_found",
  "category": "resource",
  "data": {
    "job_id": "123"
  }
}
```

### ❌ WRONG: Including statusCode

```json
{
  "errorCode": "JOB1001",
  "statusCode": 404,  // ❌ Remove this
  "message": "Job not found",
  "type": "not_found",
  "category": "resource"
}
```

### ✅ CORRECT: No statusCode

```json
{
  "errorCode": "JOB1001",
  "message": "Job not found",
  "type": "not_found",
  "category": "resource",
  "data": {}
}
```

## Checklist

Before submitting code, verify:

- [ ] `errorCode` is present (format: `XXX1234`)
- [ ] `message` is human-readable
- [ ] `type` is from ErrorType enum
- [ ] `category` is from ErrorCategory enum
- [ ] `data` contains relevant metadata
- [ ] `statusCode` is NOT included
- [ ] Error code is unique and registered
- [ ] Error follows naming convention

## Tools

### Validation Script

```python
def validate_error_object(error: dict) -> bool:
    """Validate error object format"""
    required_fields = ["errorCode", "message", "type", "category"]
    
    # Check required fields
    for field in required_fields:
        if field not in error:
            raise ValueError(f"Missing required field: {field}")
    
    # Check error code format
    import re
    if not re.match(r'^[A-Z]{3}\d{4}$', error["errorCode"]):
        raise ValueError(f"Invalid error code: {error['errorCode']}")
    
    # Check no statusCode
    if "statusCode" in error:
        raise ValueError("statusCode should not be included")
    
    return True
```

### TypeScript Type

```typescript
interface StandardError {
  errorCode: string;    // "JOB1001"
  message: string;      // "Job not found"
  type: string;         // "not_found"
  category: string;     // "resource"
  data?: Record<string, any>;  // Optional metadata
}
```

## Benefits

✅ **Consistency**: Uniform format across all errors  
✅ **Debuggable**: Unique error codes for tracking  
✅ **Client-Friendly**: Standard format for parsing  
✅ **Informative**: Metadata in `data` field  
✅ **Type-Safe**: Enums for types and categories  
✅ **Documented**: Self-documenting with error codes  

## See Also

- [Coding Standards](CODING_STANDARDS.md) - Complete coding guidelines
- [Error Guide](ERROR_GUIDE.md) - All error codes
- [Partial Bulk Delete](PARTIAL_BULK_DELETE.md) - Usage in bulk operations

---

**Last Updated**: January 7, 2026  
**Version**: 1.0.0
