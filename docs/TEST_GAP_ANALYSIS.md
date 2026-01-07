# Test Gap Analysis - Duplicate API Prefix Bug

## Bug Summary

**Issue:** API endpoints had duplicate `/api` prefix (`/api/api/v1/jobs` instead of `/api/v1/jobs`)

**Root Cause:** Service methods were calling `/api/v1/jobs` while apiClient baseURL was already `/api`

## Why Unit Tests Didn't Catch This

### 1. Incorrect Mock Setup

**The Problem:**
```typescript
// Test code
beforeEach(() => {
  apiClient = new ApiClient({ baseURL: '/api', timeout: 5000 });
  mockAxios = new MockAdapter(apiClient.getAxiosInstance());
});

it('should make successful GET request', async () => {
  const responseData = { jobs: [], total: 0 };
  
  // ❌ WRONG: Mocking the full URL path
  mockAxios.onGet('/api/v1/jobs').reply(200, responseData);
  
  // ✅ CORRECT: Calling with relative path
  const result = await apiClient.get('/v1/jobs');
});
```

**What Should Have Been Done:**
```typescript
it('should make successful GET request', async () => {
  const responseData = { jobs: [], total: 0 };
  
  // ✅ CORRECT: Mock should match what axios sees after baseURL
  mockAxios.onGet('/v1/jobs').reply(200, responseData);
  
  const result = await apiClient.get('/v1/jobs');
});
```

### 2. Mock Library Behavior

**Issue:** axios-mock-adapter may have been too lenient in matching URLs, accepting both:
- `/api/v1/jobs` (incorrect mock)
- `/v1/jobs` (correct path after baseURL)

This made the test pass even though the production code had a bug.

### 3. Missing Integration Tests

**What Was Missing:**

No test verified the **actual HTTP request URL** sent to the server. The unit tests only checked:
- ✅ Service layer logic
- ✅ Response parsing
- ❌ Actual URL construction
- ❌ Request interceptor behavior
- ❌ Full request/response cycle

## What Should Have Been Tested

### Test #1: Verify Final Request URL

```typescript
describe('URL Construction', () => {
  it('should construct correct URL with baseURL', async () => {
    const apiClient = new ApiClient({ baseURL: '/api' });
    const mockAxios = new MockAdapter(apiClient.getAxiosInstance());
    
    // Capture the actual request config
    let capturedUrl: string | undefined;
    mockAxios.onGet().reply((config) => {
      capturedUrl = config.url;
      return [200, { jobs: [] }];
    });
    
    await apiClient.get('/v1/jobs');
    
    // ✅ Verify the final URL is correct
    expect(capturedUrl).toBe('/v1/jobs');
    // Not '/api/v1/jobs' because baseURL is already '/api'
  });
});
```

### Test #2: Verify Request Interceptor Adds Correct Headers

```typescript
describe('Request Interceptor', () => {
  it('should add request ID header', async () => {
    const apiClient = new ApiClient({ baseURL: '/api' });
    const mockAxios = new MockAdapter(apiClient.getAxiosInstance());
    
    let capturedHeaders: any;
    mockAxios.onGet().reply((config) => {
      capturedHeaders = config.headers;
      return [200, {}];
    });
    
    await apiClient.get('/v1/jobs');
    
    expect(capturedHeaders['X-Request-ID']).toBeDefined();
    expect(capturedHeaders['X-Request-ID']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

### Test #3: Integration Test with Real Server

```typescript
describe('JobService Integration', () => {
  it('should fetch jobs from correct endpoint', async () => {
    // This would use a test server or msw (Mock Service Worker)
    const server = setupServer(
      http.get('http://localhost:3000/api/v1/jobs', () => {
        return HttpResponse.json({ jobs: [], total: 0 });
      })
    );
    
    server.listen();
    
    const result = await JobService.listJobs();
    
    expect(result.jobs).toEqual([]);
    
    server.close();
  });
});
```

### Test #4: E2E Test with Browser

```typescript
// Playwright/Cypress E2E test
test('should load jobs from API', async ({ page }) => {
  await page.goto('http://localhost:3000/jobs');
  
  // Intercept network requests
  const requests: string[] = [];
  await page.route('**/*', (route) => {
    requests.push(route.request().url());
    route.continue();
  });
  
  await page.waitForSelector('[data-testid="jobs-list"]');
  
  // Verify correct API endpoint was called
  expect(requests).toContain('http://localhost:8000/api/v1/jobs?page=1&page_size=20');
  // Not http://localhost:8000/api/api/v1/jobs
});
```

## Lessons Learned

### 1. **Mock What You Actually Use**

When mocking HTTP clients:
- Mock the **relative path** that the library sees
- Don't mock the **full URL** including baseURL
- Verify your mocks match the actual request

### 2. **Test URL Construction Explicitly**

```typescript
// Bad: Implicit URL testing
it('should fetch jobs', async () => {
  mockAxios.onGet('/api/v1/jobs').reply(200, { jobs: [] });
  const result = await JobService.listJobs();
  expect(result.jobs).toEqual([]);
});

// Good: Explicit URL testing
it('should fetch jobs from correct endpoint', async () => {
  let requestedUrl: string | undefined;
  mockAxios.onGet().reply((config) => {
    requestedUrl = config.url;
    return [200, { jobs: [] }];
  });
  
  await JobService.listJobs();
  
  expect(requestedUrl).toBe('/v1/jobs');
});
```

### 3. **Use Multiple Testing Layers**

| Layer | Purpose | Would Catch This Bug? |
|-------|---------|----------------------|
| Unit Tests | Test individual functions | ❌ No - mock was wrong |
| Integration Tests | Test API client + service | ✅ Yes - would see 404 |
| E2E Tests | Test full application flow | ✅ Yes - would see error |

### 4. **Verify HTTP Request Details**

Always test:
- ✅ Request URL
- ✅ Request method (GET, POST, etc.)
- ✅ Request headers
- ✅ Request body
- ✅ Query parameters

### 5. **Use Network Inspection Tools**

During development:
- Use browser DevTools Network tab
- Check backend logs for incoming requests
- Verify request URLs match expectations

## Improved Test Strategy

### Phase 1: Unit Tests (Isolated)

```typescript
describe('ApiClient Unit Tests', () => {
  it('should construct URL with baseURL', () => {
    const client = new ApiClient({ baseURL: '/api' });
    
    // Mock and capture
    const mock = new MockAdapter(client.getAxiosInstance());
    let url: string = '';
    mock.onAny().reply(config => {
      url = config.url || '';
      return [200, {}];
    });
    
    client.get('/v1/jobs');
    
    expect(url).toBe('/v1/jobs'); // Relative to baseURL
  });
});
```

### Phase 2: Integration Tests (Service + Client)

```typescript
describe('JobService Integration', () => {
  it('should call correct API endpoint', async () => {
    const mockServer = setupMockServer();
    
    mockServer.use(
      http.get('http://localhost:8000/api/v1/jobs', () => {
        return HttpResponse.json({ jobs: [] });
      })
    );
    
    const result = await JobService.listJobs();
    
    expect(result.jobs).toEqual([]);
  });
});
```

### Phase 3: E2E Tests (Full Flow)

```typescript
test('loads jobs page', async ({ page }) => {
  await page.goto('http://localhost:3000/jobs');
  
  // Verify correct API calls
  const apiCalls = await page.evaluate(() => {
    return performance.getEntriesByType('resource')
      .filter(r => r.name.includes('/api/'))
      .map(r => r.name);
  });
  
  expect(apiCalls).toContain('http://localhost:8000/api/v1/jobs');
  expect(apiCalls).not.toContain('http://localhost:8000/api/api/v1/jobs');
});
```

## Action Items

### Immediate Fixes

- [x] Fix duplicate /api prefix in service methods
- [ ] Update unit tests to use correct mock paths
- [ ] Add URL construction verification tests
- [ ] Add integration tests with real HTTP calls

### Long-term Improvements

- [ ] Add E2E tests with network inspection
- [ ] Set up API contract testing (Pact)
- [ ] Add visual regression tests
- [ ] Implement request logging in development
- [ ] Create test utilities for URL verification

## Prevention Checklist

When writing tests for HTTP clients:

1. **✅ Verify the mock matches what the library sees**
   - If using baseURL, mock relative paths
   - Test with multiple baseURL configurations

2. **✅ Capture and verify request details**
   - URL, method, headers, body, params
   - Use reply callbacks to inspect requests

3. **✅ Test different environments**
   - Local development
   - Test environment
   - Production-like setup

4. **✅ Use integration tests**
   - Test actual HTTP requests
   - Verify error handling
   - Test retry logic

5. **✅ Add E2E tests**
   - Test full user flows
   - Verify network requests
   - Check error states

## Conclusion

**The bug occurred because:**
1. Unit tests mocked the full URL path instead of the relative path
2. No integration tests verified actual HTTP requests
3. No E2E tests checked the complete request/response cycle

**Key Takeaway:** Unit tests alone are not sufficient. You need multiple testing layers to catch URL construction bugs and other integration issues.

---

**Related Documents:**
- [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- [TESTING_HANDBOOK.md](./guides/TESTING_HANDBOOK.md)
- [ERROR_HANDLING_IMPLEMENTATION.md](./ERROR_HANDLING_IMPLEMENTATION.md)

**Date:** 2026-01-07
**Version:** 1.0.0
