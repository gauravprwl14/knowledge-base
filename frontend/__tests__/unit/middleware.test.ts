/**
 * middleware.test.ts
 *
 * Unit tests for the KMS Next.js middleware.
 * Covers: auth-based redirects, locale extraction, pass-through cases.
 *
 * @jest-environment node
 */

// ---------------------------------------------------------------------------
// Polyfill — NextRequest requires the Web Fetch API globals (Request, Headers)
// which are available in Node 18+ natively.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// The intl middleware handler is stored on a shared object so it can be
// replaced/inspected from tests while the jest.mock factory closure captures
// the container (not the function reference, which changes via mockReturnValue).
const intlMiddlewareSpy = { handler: jest.fn() as jest.Mock };

// next-intl/middleware — returns the spy handler so we can track calls
jest.mock('next-intl/middleware', () => ({
  __esModule: true,
  default: () =>
    (...args: unknown[]) =>
      intlMiddlewareSpy.handler(...args),
}));

// i18n/routing — mock so middleware can import locale config without next/intl
jest.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en'],
    defaultLocale: 'en',
    localePrefix: 'as-needed',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import middleware from '@/middleware';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal NextRequest that simulates a browser navigation request.
 * Cookies are passed via the Cookie header — NextRequest parses them.
 */
function makeRequest(
  pathname: string,
  options: {
    cookie?: string;
    authHeader?: string;
    baseUrl?: string;
  } = {},
): NextRequest {
  const baseUrl = options.baseUrl ?? 'http://localhost:3000';
  const url = `${baseUrl}${pathname}`;

  const init: RequestInit & { headers?: HeadersInit } = {};
  const headers: Record<string, string> = {};

  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }
  if (options.authHeader) {
    headers['Authorization'] = options.authHeader;
  }

  init.headers = headers;

  return new NextRequest(url, init);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KMS middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intlMiddlewareSpy.handler = jest.fn().mockReturnValue(NextResponse.next());
  });

  // -------------------------------------------------------------------------
  // Protected routes — unauthenticated
  // -------------------------------------------------------------------------

  describe('protected route — no cookie', () => {
    it('redirects to /en/login with a next= query param', () => {
      // Arrange
      const req = makeRequest('/en/dashboard');

      // Act
      const res = middleware(req);

      // Assert — redirect
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/en/login');
      expect(location).toContain('next=');
    });

    it('preserves the intended path as the next= query param', () => {
      // Arrange
      const req = makeRequest('/en/chat');

      // Act
      const res = middleware(req);

      // Assert
      const location = res.headers.get('location') ?? '';
      expect(location).toContain(encodeURIComponent('/en/chat'));
    });
  });

  // -------------------------------------------------------------------------
  // Protected routes — authenticated
  // -------------------------------------------------------------------------

  describe('protected route — with kms-access-token cookie', () => {
    it('passes through to intlMiddleware when authenticated', () => {
      // Arrange
      const req = makeRequest('/en/dashboard', {
        cookie: 'kms-access-token=valid-token',
      });

      // Act
      middleware(req);

      // Assert — intlMiddleware was called (not a redirect)
      expect(intlMiddlewareSpy.handler).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Auth routes — authenticated (should redirect away)
  // -------------------------------------------------------------------------

  describe('auth route (/login) — with cookie', () => {
    it('redirects to /en/dashboard', () => {
      // Arrange
      const req = makeRequest('/en/login', {
        cookie: 'kms-access-token=valid-token',
      });

      // Act
      const res = middleware(req);

      // Assert
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/en/dashboard');
    });
  });

  describe('auth route (/register) — with cookie', () => {
    it('redirects to /en/dashboard', () => {
      // Arrange
      const req = makeRequest('/en/register', {
        cookie: 'kms-access-token=valid-token',
      });

      // Act
      const res = middleware(req);

      // Assert
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/en/dashboard');
    });
  });

  // -------------------------------------------------------------------------
  // Auth routes — unauthenticated (should pass through)
  // -------------------------------------------------------------------------

  describe('auth route (/login) — no cookie', () => {
    it('passes through to intlMiddleware', () => {
      // Arrange
      const req = makeRequest('/en/login');

      // Act
      middleware(req);

      // Assert
      expect(intlMiddlewareSpy.handler).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // /auth/callback — not in AUTH_SEGMENTS, must pass through
  // -------------------------------------------------------------------------

  describe('/auth/callback', () => {
    it('passes through when authenticated (not treated as an auth page)', () => {
      // Arrange
      const req = makeRequest('/en/auth/callback?accessToken=abc', {
        cookie: 'kms-access-token=valid-token',
      });

      // Act
      middleware(req);

      // Assert — intlMiddleware called, no redirect
      expect(intlMiddlewareSpy.handler).toHaveBeenCalled();
    });

    it('passes through when unauthenticated (not a protected route)', () => {
      // Arrange
      const req = makeRequest('/en/auth/callback?accessToken=abc');

      // Act
      middleware(req);

      // Assert — not redirected to /login
      expect(intlMiddlewareSpy.handler).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Locale extraction
  // -------------------------------------------------------------------------

  describe('locale extraction', () => {
    it('extracts "en" locale from /en/dashboard and uses it in redirect URL', () => {
      // Arrange — unauthenticated so we get a redirect
      const req = makeRequest('/en/dashboard');

      // Act
      const res = middleware(req);

      // Assert
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/en/login');
    });

    it('uses defaultLocale "en" when no locale prefix is present', () => {
      // Arrange — bare /dashboard path, no locale prefix
      const req = makeRequest('/dashboard');

      // Act
      const res = middleware(req);

      // Assert — falls back to default locale
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/en/login');
    });
  });

  // -------------------------------------------------------------------------
  // Authorization header fallback
  // -------------------------------------------------------------------------

  describe('Authorization header fallback', () => {
    it('treats a valid Bearer token header as authenticated', () => {
      // Arrange
      const req = makeRequest('/en/dashboard', {
        authHeader: 'Bearer some-access-token',
      });

      // Act
      middleware(req);

      // Assert — passes through (not redirected)
      expect(intlMiddlewareSpy.handler).toHaveBeenCalled();
    });
  });
});
