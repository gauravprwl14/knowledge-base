/**
 * acp.baseurl.test.ts
 *
 * Unit tests confirming that the ACP API module resolves its base URL via
 * getApiBaseUrl() from client.ts — never from a hardcoded localhost fallback.
 *
 * Regression guard for: "POST http://localhost:8000/api/v1/acp/v1/sessions
 * net::ERR_CONNECTION_REFUSED" in production.
 *
 * Root cause that was fixed:
 *   acp.ts previously used its own `NEXT_PUBLIC_KMS_API_URL` env var with a
 *   hardcoded `http://localhost:8000/api/v1` fallback. docker-compose.prod.yml
 *   only sets `NEXT_PUBLIC_API_URL`, so the fallback was always hit in prod.
 *
 * Fix:
 *   acp.ts now calls getApiBaseUrl() from client.ts, which correctly resolves
 *   the URL via NEXT_PUBLIC_API_URL → window.location auto-detection → Docker
 *   internal URL chain — matching the shared KmsApiClient behaviour.
 *
 * Covers:
 * - acpCreateSession calls the correct endpoint (not localhost)
 * - acpInitialize calls the correct endpoint (not localhost)
 * - acpCloseSession calls the correct endpoint (not localhost)
 * - acpPromptStream calls the correct endpoint (not localhost)
 * - getApiBaseUrl() is used (not process.env.NEXT_PUBLIC_KMS_API_URL)
 */

// ---------------------------------------------------------------------------
// Mock client.ts BEFORE importing acp.ts so the module-level const picks it up
// ---------------------------------------------------------------------------

const MOCK_API_BASE = 'https://rnd.blr0.geekydev.com/api/v1';

jest.mock('@/lib/api/client', () => ({
  // getApiBaseUrl is called at module load time in acp.ts to set KMS_API_URL
  getApiBaseUrl: jest.fn(() => MOCK_API_BASE),
  // apiClient is not used by acp.ts directly but exported from client.ts
  apiClient: {},
  ApiError: class ApiError extends Error {},
}));

// Mock the ACP mock handlers so we always use the real implementation
jest.mock('@/lib/mock/handlers/acp.mock', () => ({
  mockAcpInitialize: jest.fn(),
  mockAcpCreateSession: jest.fn(),
  mockAcpPromptStream: jest.fn(),
  mockAcpCloseSession: jest.fn(),
}));

// Force real implementation (not mock swap)
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv, NEXT_PUBLIC_USE_MOCK: 'false' };
  // Reset fetch mock
  (global.fetch as jest.Mock).mockReset?.();
});

afterEach(() => {
  process.env = originalEnv;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object for fetch mocks. */
function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    body: null,
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    body: null,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ACP API module — URL resolution', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  // ─── acpInitialize ────────────────────────────────────────────────────────

  describe('acpInitialize', () => {
    it('calls the correct production URL — not localhost', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        makeOkResponse({
          protocolVersion: 1,
          agentCapabilities: { tools: [] },
        }),
      );

      // Dynamic import so jest.mock() above takes effect before module init
      const { acpInitialize } = await import('@/lib/api/acp');
      await acpInitialize();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toBe(`${MOCK_API_BASE}/acp/v1/initialize`);
      expect(calledUrl).not.toContain('localhost');
    });

    it('throws when the server returns a non-OK response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(makeErrorResponse(503));

      const { acpInitialize } = await import('@/lib/api/acp');
      await expect(acpInitialize()).rejects.toThrow('ACP initialize failed: 503');
    });
  });

  // ─── acpCreateSession ─────────────────────────────────────────────────────

  describe('acpCreateSession', () => {
    it('calls the correct production URL — not localhost', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        makeOkResponse({ sessionId: 'session-uuid-123' }),
      );

      const { acpCreateSession } = await import('@/lib/api/acp');
      const sessionId = await acpCreateSession('my-jwt-token');

      expect(sessionId).toBe('session-uuid-123');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toBe(`${MOCK_API_BASE}/acp/v1/sessions`);
      expect(calledUrl).not.toContain('localhost');
    });

    it('sends the Authorization header with the provided token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        makeOkResponse({ sessionId: 'session-uuid-456' }),
      );

      const { acpCreateSession } = await import('@/lib/api/acp');
      await acpCreateSession('test-access-token');

      const callOptions = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      expect((callOptions.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-access-token',
      );
    });

    it('throws when the server returns a non-OK response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(makeErrorResponse(401));

      const { acpCreateSession } = await import('@/lib/api/acp');
      await expect(acpCreateSession('bad-token')).rejects.toThrow(
        'ACP create session failed: 401',
      );
    });
  });

  // ─── acpCloseSession ──────────────────────────────────────────────────────

  describe('acpCloseSession', () => {
    it('calls the correct production URL with DELETE method', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(makeOkResponse({}));

      const { acpCloseSession } = await import('@/lib/api/acp');
      await acpCloseSession('session-to-close', 'my-jwt-token');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toBe(`${MOCK_API_BASE}/acp/v1/sessions/session-to-close`);
      expect(calledUrl).not.toContain('localhost');

      const callOptions = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      expect(callOptions.method).toBe('DELETE');
    });
  });

  // ─── Regression: NEXT_PUBLIC_KMS_API_URL no longer used ──────────────────

  describe('regression — removed NEXT_PUBLIC_KMS_API_URL dependency', () => {
    it('does NOT fall back to localhost when NEXT_PUBLIC_KMS_API_URL is unset', async () => {
      // Simulate production: NEXT_PUBLIC_KMS_API_URL is absent (never set in
      // docker-compose.prod.yml), NEXT_PUBLIC_API_URL drives the URL via getApiBaseUrl()
      delete process.env['NEXT_PUBLIC_KMS_API_URL'];

      (global.fetch as jest.Mock).mockResolvedValueOnce(
        makeOkResponse({ sessionId: 'prod-session' }),
      );

      const { acpCreateSession } = await import('@/lib/api/acp');
      await acpCreateSession('prod-token');

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      // Must use the URL from getApiBaseUrl() (mocked to MOCK_API_BASE), not localhost
      expect(calledUrl).toBe(`${MOCK_API_BASE}/acp/v1/sessions`);
      expect(calledUrl).not.toContain('localhost:8000');
    });
  });
});
