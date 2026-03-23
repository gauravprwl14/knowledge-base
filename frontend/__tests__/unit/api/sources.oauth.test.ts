/**
 * sources.oauth.test.ts
 *
 * Unit tests for kmsSourcesApi.initiateGoogleDrive
 *
 * Covers:
 * - calls apiClient.get('/sources/google-drive/oauth')
 * - redirects window.location.href to the returned authUrl
 * - throws (so caller can catch) when apiClient.get rejects
 * - does NOT mutate window.location.href when apiClient rejects
 */

// ---------------------------------------------------------------------------
// Mocks — must come before any imports that use these modules
// ---------------------------------------------------------------------------

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

// Mock the mock module so the real implementation is always used in these tests
jest.mock('@/lib/mock/handlers/sources.mock', () => ({
  mockKmsSourcesApi: {},
  mockLocalSourcesApi: {},
}));

// Force NEXT_PUBLIC_USE_MOCK to false so we exercise the real implementation
const originalEnv = process.env;
beforeAll(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_USE_MOCK: 'false' };
});
afterAll(() => {
  process.env = originalEnv;
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { apiClient } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// window.location mock
// ---------------------------------------------------------------------------

let mockHref = '';

beforeEach(() => {
  mockHref = '';
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ...window.location,
      href: mockHref,
    },
  });

  // Override the setter so we can capture assignments
  Object.defineProperty(window.location, 'href', {
    configurable: true,
    get: () => mockHref,
    set: (val: string) => {
      mockHref = val;
    },
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGet = apiClient.get as jest.Mock;

/**
 * Import the module fresh each time so the USE_MOCK flag is re-evaluated.
 * We use jest.isolateModules() to prevent caching between suites.
 */
async function getSourcesApi() {
  let sourcesModule: typeof import('@/lib/api/sources');
  await jest.isolateModulesAsync(async () => {
    sourcesModule = await import('@/lib/api/sources');
  });
  return sourcesModule!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kmsSourcesApi.initiateGoogleDrive', () => {
  it('calls apiClient.get with /sources/google-drive/oauth', async () => {
    mockGet.mockResolvedValue({ authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });

    const { kmsSourcesApi } = await getSourcesApi();
    await kmsSourcesApi.initiateGoogleDrive();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/sources/google-drive/oauth');
  });

  it('redirects window.location.href to the authUrl returned by the API', async () => {
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=xyz&state=tok123';
    mockGet.mockResolvedValue({ authUrl });

    const { kmsSourcesApi } = await getSourcesApi();
    await kmsSourcesApi.initiateGoogleDrive();

    expect(mockHref).toBe(authUrl);
  });

  it('throws when apiClient.get rejects', async () => {
    const networkError = new Error('Network request failed');
    mockGet.mockRejectedValue(networkError);

    const { kmsSourcesApi } = await getSourcesApi();

    await expect(kmsSourcesApi.initiateGoogleDrive()).rejects.toThrow('Network request failed');
  });

  it('does NOT set window.location.href when apiClient.get rejects', async () => {
    mockGet.mockRejectedValue(new Error('500 Internal Server Error'));

    const { kmsSourcesApi } = await getSourcesApi();

    try {
      await kmsSourcesApi.initiateGoogleDrive();
    } catch {
      // expected
    }

    // href should still be empty — the redirect must not have happened
    expect(mockHref).toBe('');
  });

  it('does NOT set window.location.href to a real URL when authUrl is missing from the response', async () => {
    // Backend bug: returns empty object instead of { authUrl }
    mockGet.mockResolvedValue({});

    const { kmsSourcesApi } = await getSourcesApi();

    // The assignment `window.location.href = undefined` is falsy but technically
    // still happens; the important contract is it does not navigate to a real URL.
    // We coerce to string to safely apply the regex matcher.
    await kmsSourcesApi.initiateGoogleDrive();

    expect(String(mockHref ?? '')).not.toMatch(/^https?:\/\//);
  });
});
