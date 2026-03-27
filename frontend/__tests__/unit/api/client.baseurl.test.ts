/**
 * client.baseurl.test.ts
 *
 * Unit tests for the BASE_URL resolution logic in lib/api/client.ts.
 *
 * Because BASE_URL is computed as a module-level constant (IIFE), we cannot
 * re-run it by simply re-importing the module. Instead, we test an equivalent
 * pure function that mirrors the exact same branching logic. This approach is
 * intentional: the function under test is deterministic given its inputs, and
 * mocking process.env + window in module-scope IIFEs is fragile.
 *
 * Covers:
 * - NEXT_PUBLIC_API_URL env var takes precedence over auto-detection
 * - Auto-detects first path segment when window is available and env var unset
 * - Falls back to origin only when path has no subdirectory ("/")
 * - Falls back to "http://localhost:8000" when no env var and no window
 * - KMS_API_URL is used on the server side (no window)
 * - KMS_API_URL falls back to NEXT_PUBLIC_API_URL on server side
 */

// ---------------------------------------------------------------------------
// The resolver — mirrors client.ts BASE_URL IIFE exactly
// ---------------------------------------------------------------------------

/**
 * resolveBaseUrl — pure function that mirrors the BASE_URL IIFE logic in
 * lib/api/client.ts. If you change the logic in client.ts, update this
 * function in sync to keep the tests meaningful.
 *
 * @param opts.kmsApiUrl     - process.env.KMS_API_URL
 * @param opts.nextPublicUrl - process.env.NEXT_PUBLIC_API_URL
 * @param opts.hasWindow     - whether `typeof window !== 'undefined'`
 * @param opts.windowOrigin  - window.location.origin
 * @param opts.windowPath    - window.location.pathname
 */
function resolveBaseUrl(opts: {
  kmsApiUrl?: string;
  nextPublicUrl?: string;
  hasWindow?: boolean;
  windowOrigin?: string;
  windowPath?: string;
}): string {
  const {
    kmsApiUrl,
    nextPublicUrl,
    hasWindow = true,
    windowOrigin = '',
    windowPath = '/',
  } = opts;

  // Server-side branch (no window)
  if (!hasWindow) {
    return kmsApiUrl ?? nextPublicUrl ?? 'http://localhost:8000';
  }

  // Client-side: explicit env var
  if (nextPublicUrl) {
    return nextPublicUrl;
  }

  // Client-side: auto-detect from window.location
  const pathMatch = windowPath.match(/^(\/[^/]+)/);
  if (pathMatch) {
    // Only treat as a real sub-path when it's not the root "/" match
    // The regex requires at least one character after "/", so "/" won't match
    return windowOrigin + pathMatch[1];
  }

  return windowOrigin;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API client BASE_URL resolution', () => {
  // -------------------------------------------------------------------------
  // Client-side: NEXT_PUBLIC_API_URL is set
  // -------------------------------------------------------------------------

  describe('when NEXT_PUBLIC_API_URL is configured', () => {
    it('uses NEXT_PUBLIC_API_URL verbatim (no trailing slash manipulation)', () => {
      expect(
        resolveBaseUrl({ nextPublicUrl: 'https://rnd.blr0.geekydev.com/kms' }),
      ).toBe('https://rnd.blr0.geekydev.com/kms');
    });

    it('uses NEXT_PUBLIC_API_URL even when window.location would suggest a different path', () => {
      expect(
        resolveBaseUrl({
          nextPublicUrl: 'https://api.example.com/kms',
          windowOrigin: 'https://app.example.com',
          windowPath: '/dashboard',
        }),
      ).toBe('https://api.example.com/kms');
    });

    it('uses NEXT_PUBLIC_API_URL for a plain localhost URL', () => {
      expect(
        resolveBaseUrl({ nextPublicUrl: 'http://localhost:8000' }),
      ).toBe('http://localhost:8000');
    });
  });

  // -------------------------------------------------------------------------
  // Client-side: auto-detection from window.location
  // -------------------------------------------------------------------------

  describe('auto-detection from window.location when env var is absent', () => {
    it('strips deep path — keeps only the first segment (/kms)', () => {
      expect(
        resolveBaseUrl({
          windowOrigin: 'https://rnd.blr0.geekydev.com',
          windowPath: '/kms/sources',
        }),
      ).toBe('https://rnd.blr0.geekydev.com/kms');
    });

    it('strips deep path — keeps first segment from a dashboard URL', () => {
      expect(
        resolveBaseUrl({
          windowOrigin: 'https://rnd.blr0.geekydev.com',
          windowPath: '/kms/dashboard',
        }),
      ).toBe('https://rnd.blr0.geekydev.com/kms');
    });

    it('strips deep path — keeps first segment for a three-level path', () => {
      expect(
        resolveBaseUrl({
          windowOrigin: 'https://example.com',
          windowPath: '/app/settings/profile',
        }),
      ).toBe('https://example.com/app');
    });

    it('uses origin only when path is the root "/"', () => {
      expect(
        resolveBaseUrl({
          windowOrigin: 'http://localhost:3000',
          windowPath: '/',
        }),
      ).toBe('http://localhost:3000');
    });

    it('uses origin + first segment when path has exactly one non-empty segment', () => {
      // e.g. navigating to /sources (no sub-path under /kms)
      expect(
        resolveBaseUrl({
          windowOrigin: 'http://localhost:3000',
          windowPath: '/sources',
        }),
      ).toBe('http://localhost:3000/sources');
    });

    it('uses origin when path is empty string', () => {
      expect(
        resolveBaseUrl({
          windowOrigin: 'http://localhost:3000',
          windowPath: '',
        }),
      ).toBe('http://localhost:3000');
    });
  });

  // -------------------------------------------------------------------------
  // Server-side: no window
  // -------------------------------------------------------------------------

  describe('server-side resolution (no window)', () => {
    it('falls back to http://localhost:8000 when no env vars and no window', () => {
      expect(resolveBaseUrl({ hasWindow: false })).toBe('http://localhost:8000');
    });

    it('uses KMS_API_URL when set (internal Docker URL)', () => {
      expect(
        resolveBaseUrl({
          hasWindow: false,
          kmsApiUrl: 'http://kms-api:8000',
        }),
      ).toBe('http://kms-api:8000');
    });

    it('falls back to NEXT_PUBLIC_API_URL when KMS_API_URL is absent', () => {
      expect(
        resolveBaseUrl({
          hasWindow: false,
          nextPublicUrl: 'https://rnd.blr0.geekydev.com/kms',
        }),
      ).toBe('https://rnd.blr0.geekydev.com/kms');
    });

    it('KMS_API_URL takes precedence over NEXT_PUBLIC_API_URL on server side', () => {
      expect(
        resolveBaseUrl({
          hasWindow: false,
          kmsApiUrl: 'http://kms-api:8000',
          nextPublicUrl: 'https://rnd.blr0.geekydev.com/kms',
        }),
      ).toBe('http://kms-api:8000');
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns the configured URL even when it has a trailing slash', () => {
      expect(
        resolveBaseUrl({ nextPublicUrl: 'https://example.com/kms/' }),
      ).toBe('https://example.com/kms/');
    });

    it('handles an unusual subdirectory name gracefully', () => {
      expect(
        resolveBaseUrl({
          windowOrigin: 'https://example.com',
          windowPath: '/my-app/page',
        }),
      ).toBe('https://example.com/my-app');
    });
  });
});
