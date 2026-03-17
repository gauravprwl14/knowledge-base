/**
 * KMS Middleware
 *
 * Combines next-intl locale handling with auth-based route protection.
 *
 * Auth rules:
 * - Accessing a dashboard route (/[locale]/(dashboard)/*) without a valid
 *   session → redirect to /[locale]/login
 * - Accessing /[locale]/login or /[locale]/register with a valid session
 *   → redirect to /[locale]/dashboard
 *
 * Session detection:
 * - Looks for the 'kms-access-token' cookie (set by the backend on login)
 *   OR the Authorization header.
 * - This is a lightweight check — the actual token is validated server-side.
 *
 * Locale detection is delegated to next-intl's createMiddleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// ---------------------------------------------------------------------------
// next-intl middleware instance
// ---------------------------------------------------------------------------

const intlMiddleware = createIntlMiddleware(routing);

// ---------------------------------------------------------------------------
// Route patterns
// ---------------------------------------------------------------------------

/** Dashboard routes that require authentication */
const PROTECTED_SEGMENTS = [
  '/dashboard',
  '/sources',
  '/files',
  '/search',
  '/duplicates',
  '/junk',
  '/graph',
  '/chat',
  '/transcribe',
  '/collections',
  '/settings',
  '/drive',
  '/bookmarks',
  '/obsidian',
  '/results',
  '/prompts',
  '/knowledge',
];

/** Auth routes — redirect away when already authenticated */
const AUTH_SEGMENTS = ['/login', '/register'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLocale(pathname: string): string {
  // Extract the first path segment if it matches a known locale
  const segments = pathname.split('/').filter(Boolean);
  const knownLocales = routing.locales as readonly string[];
  if (segments.length > 0 && knownLocales.includes(segments[0])) {
    return segments[0];
  }
  return routing.defaultLocale;
}

function stripLocale(pathname: string, locale: string): string {
  // Remove the leading /[locale] prefix
  if (pathname.startsWith(`/${locale}`)) {
    return pathname.slice(`/${locale}`.length) || '/';
  }
  return pathname;
}

function isAuthenticated(request: NextRequest): boolean {
  // Check for access token cookie
  const cookie = request.cookies.get('kms-access-token')?.value;
  if (cookie) return true;

  // Fallback: check Authorization header (e.g. from API clients or SSR)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    return token.length > 0;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const locale = getLocale(pathname);
  const pathWithoutLocale = stripLocale(pathname, locale);

  const authenticated = isAuthenticated(request);

  // Check if this is a protected route
  const isProtected = PROTECTED_SEGMENTS.some(
    (segment) =>
      pathWithoutLocale === segment ||
      pathWithoutLocale.startsWith(`${segment}/`),
  );

  // Check if this is an auth route
  const isAuthRoute = AUTH_SEGMENTS.some(
    (segment) =>
      pathWithoutLocale === segment ||
      pathWithoutLocale.startsWith(`${segment}/`),
  );

  // Redirect unauthenticated users away from protected routes
  if (isProtected && !authenticated) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    // Preserve the intended destination for post-login redirect
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && authenticated) {
    const dashboardUrl = new URL(`/${locale}/dashboard`, request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // Delegate locale handling to next-intl
  return intlMiddleware(request);
}

export const config = {
  // Match all routes except API routes, static files, and Next.js internals
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
