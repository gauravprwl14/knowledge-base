# Frontend Error Handling Guide

This guide covers error handling best practices for the Voice App frontend application.

## Table of Contents

1. [Overview](#overview)
2. [Error Types](#error-types)
3. [Error Boundaries](#error-boundaries)
4. [HTTP Error Handling](#http-error-handling)
5. [Error Pages](#error-pages)
6. [Middleware](#middleware)
7. [Best Practices](#best-practices)

---

## Overview

The frontend implements a comprehensive error handling system that includes:

- **Error Boundaries** - Catch React component errors
- **HTTP Interceptors** - Handle API errors with retry logic
- **Custom Error Pages** - User-friendly error pages (404, 502, 503)
- **Standard Error Format** - Consistent error response parsing
- **Request Tracing** - Unique request IDs for debugging

---

## Error Types

### Standard Error Format

All API errors follow this format:

```typescript
interface StandardError {
  errors: Array<{
    errorCode: string;      // e.g., "JOB1001"
    message: string;        // Human-readable message
    type: string;           // e.g., "not_found"
    category: string;       // e.g., "resource"
    data?: Record<string, any>;  // Additional context
  }>;
  meta: {
    timestamp: string;      // ISO 8601 timestamp
    path: string;           // API endpoint path
  };
}
```

### Error Parsing

Use the `parseErrorResponse` utility to parse errors:

```typescript
import { parseErrorResponse } from '@/lib/errors';
import type { AxiosError } from 'axios';

try {
  await apiClient.post('/jobs', data);
} catch (error) {
  const parsedError = parseErrorResponse(error as AxiosError);
  console.error(parsedError.message);
  console.error(parsedError.errors); // Array of StandardError
}
```

---

## Error Boundaries

### Overview

Error boundaries catch JavaScript errors in the component tree and display fallback UI.

### Implementation

**Location:** [components/error-boundary.tsx](../../frontend/components/error-boundary.tsx)

```typescript
import { ErrorBoundary } from '@/components/error-boundary';

function App() {
  return (
    <ErrorBoundary>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

### Features

- **Error Catching** - Catches errors in child components
- **Fallback UI** - Displays user-friendly error page
- **Error Logging** - Logs errors to console (development)
- **Retry Mechanism** - Provides "Try Again" button
- **Development Mode** - Shows stack trace in development

### Root Error Boundary

The root error boundary is set up in [app/[locale]/layout.tsx](../../frontend/app/[locale]/layout.tsx):

```typescript
export default async function LocaleLayout({ children }) {
  return (
    <html lang={locale}>
      <body>
        <ErrorBoundary>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

### Custom Fallback UI

```typescript
<ErrorBoundary
  fallback={
    <div className="error-container">
      <h1>Oops! Something went wrong</h1>
      <button onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  }
>
  <MyComponent />
</ErrorBoundary>
```

### Manual Error Throwing

Use `useErrorHandler` hook to manually trigger error boundary:

```typescript
import { useErrorHandler } from '@/components/error-boundary';

function MyComponent() {
  const throwError = useErrorHandler();
  
  const handleAction = async () => {
    try {
      await riskyOperation();
    } catch (error) {
      throwError(error as Error);
    }
  };
  
  return <button onClick={handleAction}>Do Something</button>;
}
```

---

## HTTP Error Handling

### API Client Middleware

**Location:** [services/api-client.ts](../../frontend/services/api-client.ts)

The API client implements request/response interceptors:

#### Request Interceptor

```typescript
// Adds request ID for tracing
client.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = uuidv4();
  
  // Log request (development only)
  console.log(`[${requestId}] ${method} ${url}`);
  
  return config;
});
```

#### Response Interceptor

```typescript
// Handles retry logic and error transformation
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Retry on 502, 503, 504
    if (shouldRetry(error)) {
      return retryRequest(error.config);
    }
    
    // Transform error to standard format
    return Promise.reject(transformError(error));
  }
);
```

### Retry Logic

The API client automatically retries failed requests:

- **Network Errors** - No response from server
- **502 Bad Gateway** - Server unavailable
- **503 Service Unavailable** - Service down
- **504 Gateway Timeout** - Request timed out

**Configuration:**

```typescript
const apiClient = new ApiClient({
  maxRetries: 3,           // Max retry attempts
  retryDelay: 1000,        // Initial delay (ms)
  // Uses exponential backoff: 1s, 2s, 4s
});
```

### Error Handling in Services

```typescript
// services/job-service.ts
export async function bulkDeleteJobs(jobIds: string[]) {
  try {
    const response = await apiClient.delete('/jobs/bulk', {
      data: { job_ids: jobIds }
    });
    return response;
  } catch (error) {
    const parsedError = parseErrorResponse(error as AxiosError);
    
    // Handle specific errors
    if (parsedError.statusCode === 404) {
      throw new Error('Jobs not found');
    }
    
    // Re-throw for caller to handle
    throw parsedError;
  }
}
```

---

## Error Pages

### Available Pages

The frontend provides custom error pages:

1. **404 Not Found** - [app/not-found.tsx](../../frontend/app/not-found.tsx)
2. **500 Internal Error** - [app/global-error.tsx](../../frontend/app/global-error.tsx)
3. **502 Bad Gateway** - [app/502.tsx](../../frontend/app/502.tsx)
4. **503 Service Unavailable** - [app/503.tsx](../../frontend/app/503.tsx)

### 404 Not Found

Displayed when a page doesn't exist:

```typescript
// app/not-found.tsx
export default function NotFound() {
  return (
    <div className="error-page">
      <h1>404 - Page Not Found</h1>
      <Link href="/">Go Home</Link>
    </div>
  );
}
```

### 502 Bad Gateway

Displayed when the API server is temporarily unavailable:

```typescript
// app/502.tsx
export default function BadGatewayError() {
  return (
    <div className="error-page">
      <h1>502 - Bad Gateway</h1>
      <p>The server is temporarily unavailable.</p>
      <button onClick={() => window.location.reload()}>
        Try Again
      </button>
    </div>
  );
}
```

### 503 Service Unavailable

Displayed when the service is down for maintenance:

```typescript
// app/503.tsx
export default function ServiceUnavailableError() {
  return (
    <div className="error-page">
      <h1>503 - Service Unavailable</h1>
      <p>The service is temporarily unavailable.</p>
    </div>
  );
}
```

### Global Error Handler

Catches errors in the root layout:

```typescript
// app/global-error.tsx
'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body>
        <h1>Application Error</h1>
        <button onClick={reset}>Try Again</button>
      </body>
    </html>
  );
}
```

---

## Middleware

### Request Middleware

The API client adds these to every request:

```typescript
{
  headers: {
    'Content-Type': 'application/json',
    'X-Request-ID': '<uuid>',      // Request tracing
    'Authorization': 'Bearer ...',  // Auth token (if available)
  }
}
```

### Response Middleware

The API client processes responses:

1. **Success (2xx)** - Return response data
2. **Client Error (4xx)** - Parse and return standard error
3. **Server Error (5xx)** - Retry if applicable, then return error
4. **Network Error** - Retry with exponential backoff

### Logging Middleware

Logs all requests/responses in development:

```typescript
// Request log
[<request-id>] POST /api/v1/jobs {data: {...}}

// Response log
[<request-id>] Response 200 {data: {...}}

// Error log
[<request-id>] API Error: {status: 404, message: "Not found"}
```

---

## Best Practices

### 1. Always Use Error Boundaries

Wrap components that might throw errors:

```typescript
// ✅ Good
<ErrorBoundary>
  <JobsList />
</ErrorBoundary>

// ❌ Bad - No error boundary
<JobsList />
```

### 2. Handle Errors Gracefully

Show user-friendly messages:

```typescript
// ✅ Good
catch (error) {
  const parsed = parseErrorResponse(error);
  toast.error(parsed.message || 'An error occurred');
}

// ❌ Bad - Show raw error
catch (error) {
  alert(error.toString());
}
```

### 3. Log Errors for Debugging

Log errors with context:

```typescript
// ✅ Good
catch (error) {
  console.error('Failed to delete jobs:', {
    jobIds,
    error: parseErrorResponse(error),
    timestamp: new Date().toISOString()
  });
}

// ❌ Bad - No context
catch (error) {
  console.error(error);
}
```

### 4. Use Request IDs for Tracing

All requests include a unique ID:

```typescript
// Automatically added by interceptor
headers: {
  'X-Request-ID': '550e8400-e29b-41d4-a716-446655440000'
}
```

### 5. Provide Retry Mechanisms

Allow users to retry failed actions:

```typescript
<Button onClick={handleRetry}>
  Try Again
</Button>
```

### 6. Handle Partial Failures

Show detailed results for bulk operations:

```typescript
// Display success count
toast.success(`Deleted ${deleted_count} jobs`);

// Display failures
if (failed_jobs.length > 0) {
  failed_jobs.forEach(failure => {
    toast.error(`Failed to delete job ${failure.data.job_id}: ${failure.message}`);
  });
}
```

### 7. Test Error Scenarios

Write tests for error cases:

```typescript
it('should display error message when API fails', async () => {
  mockApi.onDelete('/jobs/bulk').reply(500, {
    errors: [{
      errorCode: 'SYS9000',
      message: 'Internal server error',
      type: 'internal_error',
      category: 'system',
      data: {}
    }]
  });
  
  await bulkDelete(['123']);
  
  expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
});
```

### 8. Use Type-Safe Error Handling

Define error types:

```typescript
interface ApiError {
  statusCode: number;
  message: string;
  errors: StandardError[];
}

function handleApiError(error: ApiError) {
  // Type-safe error handling
}
```

---

## Examples

### Complete Error Handling Flow

```typescript
'use client';

import { useState } from 'react';
import { useErrorHandler, ErrorBoundary } from '@/components/error-boundary';
import { bulkDeleteJobs } from '@/services/job-service';
import { parseErrorResponse } from '@/lib/errors';
import { toast } from 'sonner';

function JobsPage() {
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const throwError = useErrorHandler();

  const handleBulkDelete = async () => {
    if (selectedJobs.length === 0) {
      toast.error('No jobs selected');
      return;
    }

    try {
      setIsDeleting(true);
      
      // Call API
      const result = await bulkDeleteJobs(selectedJobs);
      
      // Show success message
      toast.success(`Deleted ${result.deleted_count} jobs`);
      
      // Handle partial failures
      if (result.failed_jobs.length > 0) {
        result.failed_jobs.forEach(failure => {
          console.error('Failed to delete job:', {
            jobId: failure.data?.job_id,
            errorCode: failure.errorCode,
            message: failure.message,
          });
          
          toast.error(
            `Failed to delete job ${failure.data?.job_id}: ${failure.message}`
          );
        });
      }
      
      // Clear selection
      setSelectedJobs([]);
      
    } catch (error) {
      // Parse error
      const parsed = parseErrorResponse(error);
      
      console.error('Bulk delete failed:', {
        selectedJobs,
        error: parsed,
      });
      
      // Show user-friendly message
      if (parsed.statusCode === 404) {
        toast.error('Some jobs were not found');
      } else if (parsed.statusCode === 403) {
        toast.error('You do not have permission to delete these jobs');
      } else if (parsed.statusCode >= 500) {
        toast.error('Server error. Please try again later.');
      } else {
        toast.error(parsed.message || 'Failed to delete jobs');
      }
      
      // For critical errors, trigger error boundary
      if (parsed.statusCode >= 500) {
        throwError(new Error(parsed.message));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleBulkDelete}
        disabled={isDeleting || selectedJobs.length === 0}
      >
        {isDeleting ? 'Deleting...' : 'Delete Selected'}
      </button>
    </div>
  );
}

// Wrap with error boundary
export default function JobsPageWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <JobsPage />
    </ErrorBoundary>
  );
}
```

---

## References

- [Error Boundary Component](../../frontend/components/error-boundary.tsx)
- [API Client](../../frontend/services/api-client.ts)
- [Error Utilities](../../frontend/lib/errors/types.ts)
- [Error Guide](../guides/ERROR_GUIDE.md)
- [Standard Error Format](../STANDARD_ERROR_FORMAT.md)

---

**Last Updated:** 2024-01-15
**Version:** 1.0.0
