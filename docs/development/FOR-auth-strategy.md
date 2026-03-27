# FOR-auth-strategy.md — Frontend Authentication Strategy

## Overview

KMS uses a **dual-token, middleware-guarded** auth strategy:

| Token | Storage | Purpose |
|-------|---------|---------|
| Access token (JWT, 15 min) | In-memory (`authStore.state.accessToken`) | Sent as `Authorization: Bearer` on every API call |
| Refresh token (JWT, 7 days) | `localStorage` (`kms_refresh_token`) | Used to silently re-issue access tokens on 401 |
| Session cookie (`kms-access-token`) | `document.cookie` (`path=/; max-age=7d`) | Read by Next.js middleware to gate protected routes |

---

## Why a session cookie when tokens are already in memory?

The Next.js middleware runs **server-side** (Edge runtime) — it cannot see client-side JavaScript state (`authStore`). The only way for middleware to know the user is authenticated is via an HTTP cookie.

The `kms-access-token` cookie holds the current access token value. Middleware checks **presence only** (not JWT validity). Actual token validation happens on the backend.

---

## Login flows

### Email / password

```
Browser → POST /api/v1/auth/login
       ← { accessToken, refreshToken, expiresIn }

LoginFeature.tsx:
  1. localStorage.setItem('kms_refresh_token', refreshToken)
  2. storeLogin(user, accessToken)        ← writes authStore + cookie
  3. getMe() → storeLogin(realUser, ...)  ← updates user profile
  4. router.push(?next ?? /dashboard)
```

### Google OAuth

```
Browser → GET /api/v1/auth/google          (→ backend → Google consent)
Google  → GET /api/v1/auth/google/callback (backend exchanges code for tokens)
Backend → 302 /kms/en/auth/callback?accessToken=<jwt>&refreshToken=<jwt>

auth/callback/page.tsx:
  1. storeLogin({}, accessToken)           ← writes authStore + cookie IMMEDIATELY
  2. localStorage.setItem('kms_refresh_token', refreshToken)
  3. getMe() → storeLogin(realUser, ...)   ← updates user profile + rewrites cookie
  4. router.replace(?next ?? /dashboard)   ← uses next-intl router (no locale prefix)
```

---

## Session restoration on page reload

`AuthProvider.tsx` (root layout, mounts once per session):

```
On mount:
  if (currentUser already in store)  → skip (just logged in, state still live)
  if (no kms_refresh_token in localStorage) → skip (fresh session, no prior login)
  else:
    POST /kms/api/v1/auth/refresh { refreshToken }
    ← { accessToken, refreshToken }
    storeSetAccessToken(newAccessToken)   ← updates store + cookie
    localStorage.setItem('kms_refresh_token', newRefreshToken)
    getMe() → storeLogin(user, newAccessToken)
```

---

## Silent refresh on 401

`lib/api/client.ts` (Axios response interceptor):

```
API call returns 401:
  → client.ts reads localStorage('kms_refresh_token')
  → POST /api/v1/auth/refresh
  ← { accessToken, refreshToken }
  → tokenProvider.setAccessToken(newToken)   ← storeSetAccessToken() → updates cookie
  → localStorage.setItem('kms_refresh_token', newRefreshToken)
  → retry original request with new token

If refresh fails:
  → tokenProvider.onAuthFailure() → storeLogout() → clears store + cookie
  → user sees login page (middleware redirects on next navigation)
```

---

## Middleware route protection

`middleware.ts` checks `request.cookies.get('kms-access-token')`:

```
Request for /dashboard, /search, /files, etc.:
  cookie present → allow, delegate locale to next-intl
  cookie absent  → 302 /[locale]/login?next=[original path]   (Cache-Control: no-store)

Request for /login, /register when already authenticated:
  cookie present → 302 /[locale]/dashboard                    (Cache-Control: no-store)
```

`Cache-Control: no-store` prevents the Next.js Router Cache from storing redirect responses.

---

## Key rules — what MUST NOT be changed

| Rule | Why |
|------|-----|
| `storeLogin()` and `storeSetAccessToken()` are the **only** way to update the token | Both write `document.cookie` alongside the store. Direct `authStore.setState()` skips the cookie |
| `storeLogout()` is the **only** way to clear auth state | It clears both store and cookie. Direct `authStore.setState()` leaves a stale cookie |
| `auth/callback/page.tsx` must NOT call `apiClient.setTokenProvider()` | The root layout's `AuthProvider` already registers the correct provider. Calling it again overwrites the cookie-writing callbacks for the entire session |
| `useSearchParams()` must be inside `<Suspense>` | Without Suspense, searchParams is null in production static rendering — the callback page would redirect to `/login?error=oauth_failed` |
| Use `router` from `@/i18n/routing`, not `next/navigation` | next-intl's router handles locale prefixes correctly; the raw Next.js router navigates to `/en/dashboard` which triggers a redundant 302 to `/dashboard` |

---

## Debugging checklist

When redirected to login unexpectedly:

1. **Browser DevTools → Application → Cookies**: Is `kms-access-token` present on the domain?
2. **Browser DevTools → Application → Local Storage**: Is `kms_refresh_token` present?
3. **Network tab**: On navigation to a protected route, is the cookie included in request headers?
4. **Network tab**: Is the response a 302 with `Location: .../login`? If yes, the middleware did not see the cookie.
5. Check that `NEXT_PUBLIC_API_URL` is set correctly in the Docker environment (defaults to `localhost:8000` which is unreachable from a remote browser).

---

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_API_URL` | `.env.local` / Docker env | Base URL for API calls and Google OAuth initiation. Must be the publicly reachable API base (e.g. `https://rnd.blr0.geekydev.com/kms`). Default: `http://localhost:8000` |
| `KMS_API_URL` | Docker env (server-side only) | Next.js rewrite destination for `/api/*` → backend. Default: `http://kms-api:8000` |
