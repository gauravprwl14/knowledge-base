/**
 * E2E tests for Jobs page
 * Tests complete user flows including API calls
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Jobs Page E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Setup route interception to verify API calls
    await page.route('**/api/**', (route) => {
      console.log(`API Request: ${route.request().method()} ${route.request().url()}`);
      route.continue();
    });
  });

  test('should load jobs from correct API endpoint', async ({ page }) => {
    const apiCalls: string[] = [];

    // Intercept and record all API calls
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      apiCalls.push(url);
      
      // Mock response
      if (url.includes('/api/v1/jobs')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jobs: [
              {
                id: '123',
                status: 'completed',
                job_type: 'transcription',
                provider: 'whisper',
                model_name: 'base',
                original_filename: 'test.mp3',
                progress: 100,
                error_message: null,
                created_at: '2024-01-01T00:00:00Z',
                completed_at: '2024-01-01T00:05:00Z',
              },
            ],
            total: 1,
            page: 1,
            page_size: 20,
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('http://localhost:3000/en/jobs');

    // Wait for jobs to load
    await page.waitForSelector('[data-testid="jobs-list"]', { timeout: 10000 });

    // Verify correct API endpoint was called
    const jobsApiCall = apiCalls.find(url => url.includes('/jobs'));
    expect(jobsApiCall).toBeDefined();
    expect(jobsApiCall).toContain('/api/v1/jobs');
    
    // Critical: Ensure NO duplicate /api prefix
    expect(jobsApiCall).not.toContain('/api/api/v1/jobs');
    
    // Verify jobs are displayed
    const jobCards = await page.locator('[data-testid="job-card"]').count();
    expect(jobCards).toBeGreaterThan(0);
  });

  test('should verify API request URL structure', async ({ page }) => {
    let requestUrl: string = '';

    await page.route('**/api/v1/jobs*', (route) => {
      requestUrl = route.request().url();
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [],
          total: 0,
          page: 1,
          page_size: 20,
        }),
      });
    });

    await page.goto('http://localhost:3000/en/jobs');
    await page.waitForLoadState('networkidle');

    // Parse the URL to verify structure
    const url = new URL(requestUrl);
    
    // Verify path is correct
    expect(url.pathname).toBe('/api/v1/jobs');
    
    // Verify query parameters
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('page_size')).toBe('20');
  });

  test('should make DELETE request to correct endpoint for bulk delete', async ({ page }) => {
    let deleteRequestUrl: string = '';
    let deleteRequestMethod: string = '';
    let deleteRequestBody: any;

    // Mock GET request for jobs list
    await page.route('**/api/v1/jobs?*', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jobs: [
              {
                id: '123',
                status: 'completed',
                job_type: 'transcription',
                provider: 'whisper',
                model_name: 'base',
                original_filename: 'test.mp3',
                progress: 100,
                error_message: null,
                created_at: '2024-01-01T00:00:00Z',
                completed_at: '2024-01-01T00:05:00Z',
              },
            ],
            total: 1,
            page: 1,
            page_size: 20,
          }),
        });
      }
    });

    // Mock DELETE request for bulk delete
    await page.route('**/api/v1/jobs/bulk', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteRequestUrl = route.request().url();
        deleteRequestMethod = route.request().method();
        deleteRequestBody = await route.request().postDataJSON();
        
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            deleted_count: 1,
            failed_count: 0,
            total_requested: 1,
            deleted_jobs: [
              { job_id: '123', original_filename: 'test.mp3', status: 'deleted' },
            ],
            failed_jobs: [],
            files_deleted_count: 1,
            files_failed_count: 0,
          }),
        });
      }
    });

    await page.goto('http://localhost:3000/en/jobs');
    await page.waitForSelector('[data-testid="job-card"]');

    // Select job
    await page.click('[data-testid="job-checkbox-123"]');

    // Click bulk delete button
    await page.click('[data-testid="bulk-delete-button"]');

    // Confirm deletion
    await page.click('[data-testid="confirm-delete"]');

    // Wait for delete request
    await page.waitForTimeout(1000);

    // Verify correct endpoint and method
    expect(deleteRequestUrl).toContain('/api/v1/jobs/bulk');
    expect(deleteRequestUrl).not.toContain('/api/api');
    expect(deleteRequestMethod).toBe('DELETE');
    expect(deleteRequestBody.job_ids).toEqual(['123']);
  });

  test('should handle 404 error from API', async ({ page }) => {
    await page.route('**/api/v1/jobs*', (route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{
            errorCode: 'JOB1001',
            message: 'Jobs not found',
            type: 'not_found',
            category: 'resource',
            data: {},
          }],
          meta: {
            timestamp: '2024-01-01T00:00:00Z',
            path: '/api/v1/jobs',
          },
        }),
      });
    });

    await page.goto('http://localhost:3000/en/jobs');

    // Should show error message
    await expect(page.locator('text=Not Found')).toBeVisible({ timeout: 5000 });
  });

  test('should verify request headers', async ({ page }) => {
    let requestHeaders: Record<string, string> = {};

    await page.route('**/api/v1/jobs*', (route) => {
      const headers = route.request().headers();
      Object.assign(requestHeaders, headers);
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [],
          total: 0,
          page: 1,
          page_size: 20,
        }),
      });
    });

    await page.goto('http://localhost:3000/en/jobs');
    await page.waitForLoadState('networkidle');

    // Verify X-Request-ID header is present
    expect(requestHeaders['x-request-id']).toBeDefined();
    expect(requestHeaders['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  test('should verify pagination query parameters', async ({ page }) => {
    let queryParams: URLSearchParams | undefined;

    await page.route('**/api/v1/jobs*', (route) => {
      const url = new URL(route.request().url());
      queryParams = url.searchParams;
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [],
          total: 100,
          page: 2,
          page_size: 10,
        }),
      });
    });

    await page.goto('http://localhost:3000/en/jobs?page=2&page_size=10');
    await page.waitForLoadState('networkidle');

    // Verify pagination parameters
    expect(queryParams?.get('page')).toBe('2');
    expect(queryParams?.get('page_size')).toBe('10');
  });

  test('should monitor all network requests for duplicate prefixes', async ({ page }) => {
    const allRequests: string[] = [];

    // Capture ALL requests
    page.on('request', (request) => {
      allRequests.push(request.url());
    });

    await page.route('**/api/**', (route) => route.continue());

    await page.goto('http://localhost:3000/en/jobs');
    await page.waitForLoadState('networkidle');

    // Check all API requests
    const apiRequests = allRequests.filter(url => url.includes('/api/'));
    
    // Ensure NO request has duplicate /api prefix
    const duplicateRequests = apiRequests.filter(url => 
      url.includes('/api/api')
    );

    expect(duplicateRequests).toHaveLength(0);
  });
});

test.describe('Transcriptions Page E2E', () => {
  test('should load transcriptions from correct endpoint', async ({ page }) => {
    let requestUrl: string = '';

    await page.route('**/api/v1/transcriptions*', (route) => {
      requestUrl = route.request().url();
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          transcriptions: [
            {
              id: '123',
              job_id: '456',
              text: 'Test transcription',
              language: 'en',
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 20,
        }),
      });
    });

    await page.goto('http://localhost:3000/en/transcriptions');
    await page.waitForLoadState('networkidle');

    // Verify correct endpoint
    expect(requestUrl).toContain('/api/v1/transcriptions');
    expect(requestUrl).not.toContain('/api/api/v1/transcriptions');
  });
});
