# API Documentation - Swagger/OpenAPI

## Accessing the Documentation

The API documentation is automatically generated using FastAPI's built-in OpenAPI/Swagger support.

### Development Environment

**Swagger UI**: http://localhost:8000/docs  
**ReDoc**: http://localhost:8000/redoc  
**OpenAPI JSON**: http://localhost:8000/openapi.json

### Production Environment

**Swagger UI**: https://your-domain.com/docs  
**ReDoc**: https://your-domain.com/redoc  
**OpenAPI JSON**: https://your-domain.com/openapi.json

## Features

### Interactive API Testing

The Swagger UI provides:
- 📝 Try out API endpoints directly in the browser
- 🔐 Authentication testing (API key)
- 📊 View request/response examples
- 🎯 See all available endpoints and parameters
- ✅ Validate requests before sending

### Documentation Highlights

#### Bulk Delete Endpoint

**URL**: `POST /api/v1/jobs/bulk/delete`

**Key Features Documented**:
1. **Request Format**
   - Example with 3 job UUIDs
   - Validation rules (1-100 jobs)
   - UUID format requirements

2. **Response Examples**
   - ✅ All success scenario (10/10 deleted)
   - ⚠️ Partial success scenario (8/10 deleted, 2 failed)
   - ❌ Validation errors (empty list, limit exceeded)
   - 🔒 Authorization errors
   - 💥 Server errors

3. **Error Codes**
   - JOB1001: Job not found
   - JOB1007: Empty job list
   - JOB1008: Limit exceeded (>100)
   - JOB1010: Database error

4. **Detailed Descriptions**
   - How partial success works
   - When to expect each error
   - Example scenarios explained

## Using Swagger UI

### 1. Navigate to Swagger UI

Open http://localhost:8000/docs in your browser.

### 2. Authenticate

1. Click the **"Authorize"** button (🔓 lock icon)
2. Enter your API key in the `X-API-Key` field
3. Click **"Authorize"**
4. Click **"Close"**

### 3. Test Bulk Delete Endpoint

1. Find **"Jobs - Bulk Operations"** section
2. Click on **"POST /api/v1/jobs/bulk/delete"**
3. Click **"Try it out"**
4. Edit the request body with your job IDs:

```json
{
  "job_ids": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ]
}
```

5. Click **"Execute"**
6. View the response below

### 4. View Response Examples

The documentation includes multiple response examples:

**Example 1: All Success**
```json
{
  "deleted_count": 10,
  "failed_count": 0,
  "total_requested": 10,
  "deleted_jobs": [...],
  "failed_jobs": [],
  "files_deleted_count": 30,
  "files_failed_count": 0
}
```

**Example 2: Partial Success (8 deleted, 2 failed)**
```json
{
  "deleted_count": 8,
  "failed_count": 2,
  "total_requested": 10,
  "deleted_jobs": [...],
  "failed_jobs": [
    {
      "job_id": "...",
      "original_filename": "audio9.mp3",
      "error": "Job not found or access denied"
    }
  ],
  "files_deleted_count": 24,
  "files_failed_count": 2
}
```

## Documentation Structure

### Endpoint Information

Each endpoint includes:

```yaml
Summary: Bulk Delete Jobs
Description: |
  Delete multiple jobs at once with all associated data and files.
  
  Features:
  - Delete 1-100 jobs in a single request
  - Automatically cancels processing jobs
  - Returns detailed success/failure breakdown
  
  Partial Success Handling:
  When some jobs fail to delete, the endpoint:
  - Returns HTTP 200 with detailed breakdown
  - Provides deleted_count and failed_count
  - Lists successfully deleted jobs
  - Lists failed jobs with error messages

Tags: ["Jobs - Bulk Operations"]
```

### Request Schema

```yaml
BulkDeleteRequest:
  type: object
  required:
    - job_ids
  properties:
    job_ids:
      type: array
      items:
        type: string
        format: uuid
      minItems: 1
      maxItems: 100
      description: List of job UUIDs to delete (1-100 jobs)
      example:
        - "550e8400-e29b-41d4-a716-446655440000"
        - "550e8400-e29b-41d4-a716-446655440001"
```

### Response Schema

```yaml
BulkDeleteResponse:
  type: object
  required:
    - deleted_count
    - failed_count
    - total_requested
    - deleted_jobs
    - failed_jobs
    - files_deleted_count
    - files_failed_count
  properties:
    deleted_count:
      type: integer
      description: Number of jobs successfully deleted
      example: 8
    failed_count:
      type: integer
      description: Number of jobs that failed to delete
      example: 2
    # ... other fields
```

### Response Status Codes

```yaml
responses:
  200:
    description: Successful bulk delete (may include partial failures)
    content:
      application/json:
        examples:
          all_success: { ... }
          partial_success: { ... }
  400:
    description: Validation error
    content:
      application/json:
        examples:
          empty_list: { ... }
          limit_exceeded: { ... }
  401:
    description: Unauthorized - Invalid or missing API key
  404:
    description: No matching jobs found
  500:
    description: Database or server error
```

## Advanced Features

### 1. Download OpenAPI Spec

Download the complete API specification:

```bash
curl http://localhost:8000/openapi.json > api-spec.json
```

Use with:
- Postman (import OpenAPI spec)
- Insomnia (import OpenAPI spec)
- Code generators (openapi-generator)

### 2. Generate Client Libraries

Generate client code for various languages:

```bash
# Install openapi-generator
npm install -g @openapitools/openapi-generator-cli

# Generate TypeScript client
openapi-generator-cli generate \
  -i http://localhost:8000/openapi.json \
  -g typescript-axios \
  -o ./generated-client

# Generate Python client
openapi-generator-cli generate \
  -i http://localhost:8000/openapi.json \
  -g python \
  -o ./generated-client-python
```

### 3. API Testing with Postman

1. Open Postman
2. Click **Import**
3. Select **Link**
4. Enter: `http://localhost:8000/openapi.json`
5. Click **Continue** → **Import**
6. All endpoints imported with examples!

### 4. API Testing with cURL

Copy cURL commands directly from Swagger UI:

1. Execute any endpoint in Swagger UI
2. Click **"Copy cURL"** button
3. Paste in terminal:

```bash
curl -X 'POST' \
  'http://localhost:8000/api/v1/jobs/bulk/delete' \
  -H 'accept: application/json' \
  -H 'X-API-Key: your-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
  "job_ids": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ]
}'
```

## ReDoc Alternative

ReDoc provides a different view optimized for reading:

### Features
- 📖 Three-column layout (navigation, content, examples)
- 🎨 Beautiful typography
- 📱 Mobile-friendly
- 🔍 Search functionality
- 📥 Download OpenAPI spec

### Access
http://localhost:8000/redoc

## Customizing Documentation

### Adding More Examples

Edit the endpoint in `app/api/v1/endpoints/jobs.py`:

```python
@router.post(
    "/bulk/delete",
    responses={
        200: {
            "content": {
                "application/json": {
                    "examples": {
                        "your_example": {
                            "summary": "Your Example Title",
                            "value": { ... }
                        }
                    }
                }
            }
        }
    }
)
```

### Adding Endpoint Descriptions

```python
@router.post(
    "/bulk/delete",
    summary="Short title",
    description="""
    Detailed description with markdown support.
    
    **Features:**
    - Feature 1
    - Feature 2
    
    **Example:**
    ```json
    { ... }
    ```
    """,
    response_description="What this endpoint returns"
)
```

### Organizing with Tags

```python
@router.post(
    "/bulk/delete",
    tags=["Jobs - Bulk Operations", "Admin"]
)
```

### Adding Deprecation Warnings

```python
@router.post(
    "/bulk/delete",
    deprecated=True,
    summary="Use /v2/jobs/bulk/delete instead"
)
```

## API Documentation Best Practices

### 1. Clear Descriptions
- Explain what the endpoint does
- Include use cases
- Mention limitations (e.g., 100 job limit)

### 2. Comprehensive Examples
- Show success cases
- Show error cases
- Include edge cases
- Use realistic data

### 3. Error Documentation
- List all possible error codes
- Explain when each error occurs
- Show error response format

### 4. Authentication
- Document required headers
- Show example API keys (redacted)
- Explain authorization rules

### 5. Partial Success
- Explain how partial success works
- Show partial success examples
- Document client handling

## Troubleshooting

### Swagger UI Not Loading

1. **Check Backend is Running**
   ```bash
   curl http://localhost:8000/health
   ```

2. **Check CORS Settings**
   Ensure CORS allows localhost:8000

3. **Check OpenAPI JSON**
   ```bash
   curl http://localhost:8000/openapi.json
   ```

4. **Clear Browser Cache**
   Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Authentication Not Working

1. **Check API Key Format**
   - Should be plain API key, not base64
   - Check for extra spaces

2. **Check Header Name**
   - Must be `X-API-Key` (case-sensitive)

3. **Test with cURL**
   ```bash
   curl -H "X-API-Key: your-key" http://localhost:8000/api/v1/jobs
   ```

### Examples Not Showing

1. **Restart Backend**
   ```bash
   podman-compose restart backend
   ```

2. **Check Pydantic Models**
   Ensure `Config.json_schema_extra` is set

3. **Check FastAPI Version**
   ```bash
   pip show fastapi
   ```

## Screenshots

### Swagger UI - Bulk Delete Endpoint

```
┌─────────────────────────────────────────────────────────┐
│  POST /api/v1/jobs/bulk/delete                          │
│  Bulk Delete Jobs                                       │
│                                                         │
│  Delete multiple jobs at once with all associated data  │
│  and files.                                            │
│                                                         │
│  [Try it out]                                          │
│                                                         │
│  Parameters                                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Request body *                                   │  │
│  │ {                                                │  │
│  │   "job_ids": [                                   │  │
│  │     "550e8400-e29b-41d4-a716-446655440000",     │  │
│  │     "550e8400-e29b-41d4-a716-446655440001"      │  │
│  │   ]                                              │  │
│  │ }                                                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  [Execute]                                             │
│                                                         │
│  Responses                                             │
│  ├─ 200  Successful bulk delete                        │
│  │  └─ Examples                                        │
│  │     ├─ All success                                  │
│  │     └─ Partial success - 8 deleted, 2 failed       │
│  ├─ 400  Validation error                              │
│  ├─ 401  Unauthorized                                  │
│  ├─ 404  No matching jobs found                        │
│  └─ 500  Database or server error                      │
└─────────────────────────────────────────────────────────┘
```

## Summary

The API documentation provides:

✅ **Interactive Testing**: Try endpoints in the browser  
✅ **Multiple Examples**: Success, partial success, errors  
✅ **Clear Descriptions**: Features, limitations, error handling  
✅ **Response Codes**: All possible HTTP status codes documented  
✅ **Authentication**: API key setup and testing  
✅ **Export Options**: OpenAPI JSON, Postman, cURL  
✅ **Two Interfaces**: Swagger UI and ReDoc  
✅ **Auto-Generated**: Updates automatically with code changes  

Access the documentation at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json
