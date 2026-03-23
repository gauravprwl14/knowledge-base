/**
 * client.test.ts
 *
 * Unit tests for KmsApiClient — specifically the response interceptor that
 * unwraps the NestJS TransformInterceptor envelope:
 *
 *   { success: true, data: <payload>, meta: {...}, timestamp: "..." }
 *   → <payload>
 *
 * Root cause context
 * ──────────────────
 * The kms-api has a global TransformInterceptor that wraps every successful
 * response in a `{ success: true, data: ... }` envelope.  Without unwrapping,
 * callers receive the wrapper object instead of the typed payload, causing
 * runtime errors like "sources.map is not a function".
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// axios — use jest's manual module mock; we intercept at the instance level
jest.mock('axios', () => {
  const mockAxiosInstance = {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => mockAxiosInstance),
      post: jest.fn(), // used internally by refresh()
    },
    ...jest.requireActual('axios'),
  };
});

// ---------------------------------------------------------------------------
// Helpers — test the interceptor logic directly (white-box)
// ---------------------------------------------------------------------------

/**
 * Extracts the response-success interceptor registered by KmsApiClient
 * so we can call it in isolation without a running HTTP server.
 *
 * KmsApiClient calls:
 *   this.http.interceptors.response.use(successFn, errorFn)
 * We capture `successFn` and call it with synthetic AxiosResponse objects.
 */
function extractSuccessInterceptor() {
  // Clear module registry so axios mock is fresh
  jest.resetModules();

  // Re-require after reset so interceptors.response.use is captured cleanly
  const axiosMock = require('axios');
  const mockInstance = axiosMock.default.create();

  let capturedSuccessFn: ((res: object) => object) | null = null;
  (mockInstance.interceptors.response.use as jest.Mock).mockImplementation(
    (successFn: (res: object) => object) => {
      capturedSuccessFn = successFn;
    },
  );

  // Importing the module triggers the constructor which registers the interceptor
  require('@/lib/api/client');

  return capturedSuccessFn as unknown as (res: object) => { data: unknown };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KmsApiClient — response success interceptor (TransformInterceptor unwrapping)', () => {
  /**
   * Simulate the interceptor by importing the module and calling the
   * responseSuccessInterceptor method directly via a cast.
   * This approach avoids a full HTTP server and is deterministic.
   */

  // We import the actual client and test through its public interface
  // by making assertions on what `.get()` returns after the interceptor runs.

  // Rather than fighting the module mock complexity, we test the BEHAVIOUR
  // by calling the internal method via a helper that creates a fresh client.

  let client: import('@/lib/api/client').KmsApiClient;

  beforeEach(() => {
    jest.resetModules();
    jest.unmock('axios');
  });

  // -------------------------------------------------------------------------
  // Direct method test (bypasses HTTP entirely)
  // -------------------------------------------------------------------------

  it('unwraps { success: true, data: payload } to payload', async () => {
    const { KmsApiClient } = require('@/lib/api/client') as typeof import('@/lib/api/client');
    client = new KmsApiClient();

    // Access the private method via type cast
    const interceptor = (client as unknown as {
      responseSuccessInterceptor: (r: { data: unknown }) => { data: unknown };
    }).responseSuccessInterceptor.bind(client);

    const wrapped = {
      data: {
        success: true,
        data: [{ id: '1', type: 'GOOGLE_DRIVE' }],
        meta: { requestId: 'r1' },
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    };

    const result = interceptor(wrapped);
    expect(result.data).toEqual([{ id: '1', type: 'GOOGLE_DRIVE' }]);
  });

  it('passes through responses that are NOT wrapped (raw payloads)', async () => {
    const { KmsApiClient } = require('@/lib/api/client') as typeof import('@/lib/api/client');
    client = new KmsApiClient();

    const interceptor = (client as unknown as {
      responseSuccessInterceptor: (r: { data: unknown }) => { data: unknown };
    }).responseSuccessInterceptor.bind(client);

    const raw = { data: [{ id: '1' }] };
    const result = interceptor(raw);
    expect(result.data).toEqual([{ id: '1' }]);
  });

  it('passes through { success: true } without a data key', async () => {
    const { KmsApiClient } = require('@/lib/api/client') as typeof import('@/lib/api/client');
    client = new KmsApiClient();

    const interceptor = (client as unknown as {
      responseSuccessInterceptor: (r: { data: unknown }) => { data: unknown };
    }).responseSuccessInterceptor.bind(client);

    // A response with `success: true` but NO `data` field should not be unwrapped
    const partial = { data: { success: true, message: 'ok' } };
    const result = interceptor(partial);
    expect(result.data).toEqual({ success: true, message: 'ok' });
  });

  it('unwraps when data payload is null (e.g. DELETE 204)', async () => {
    const { KmsApiClient } = require('@/lib/api/client') as typeof import('@/lib/api/client');
    client = new KmsApiClient();

    const interceptor = (client as unknown as {
      responseSuccessInterceptor: (r: { data: unknown }) => { data: unknown };
    }).responseSuccessInterceptor.bind(client);

    const wrapped = {
      data: {
        success: true,
        data: null,
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    };

    const result = interceptor(wrapped);
    expect(result.data).toBeNull();
  });

  it('unwraps nested object payloads', async () => {
    const { KmsApiClient } = require('@/lib/api/client') as typeof import('@/lib/api/client');
    client = new KmsApiClient();

    const interceptor = (client as unknown as {
      responseSuccessInterceptor: (r: { data: unknown }) => { data: unknown };
    }).responseSuccessInterceptor.bind(client);

    const user = { id: 'u1', email: 'x@y.com', name: 'X', roles: ['USER'] };
    const wrapped = {
      data: {
        success: true,
        data: user,
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    };

    const result = interceptor(wrapped);
    expect(result.data).toEqual(user);
  });
});
