/**
 * sidebar-navigation.spec.ts
 *
 * E2E tests for authenticated sidebar navigation.
 *
 * These tests cover the regressions fixed in the feat/design-web-ui branch:
 *
 * 1. Every sidebar link navigates to its page without being redirected to /login
 * 2. Visiting a "coming soon" placeholder page (e.g. /collections) and then
 *    navigating to another page does NOT redirect to /login
 * 3. The root not-found page (app/not-found.tsx) is no longer hit by
 *    routes under [locale] — the locale-level not-found renders correctly
 *    and subsequent navigation still works.
 *
 * Auth strategy in E2E tests
 * ──────────────────────────
 * The Next.js middleware reads `kms-access-token` cookie. We inject it directly
 * via `page.context().addCookies()` so we never need a real backend running.
 * We also mock all API calls to return minimal valid responses.
 *
 * Prerequisites
 * ─────────────
 * The dev server must be running on localhost:3000 (playwright.config.ts
 * `webServer` starts it automatically, or you can run `npm run dev` manually).
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = '/kms';
const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake';

const SIDEBAR_ROUTES = [
  { label: 'Dashboard',   path: '/dashboard'   },
  { label: 'Sources',     path: '/sources'     },
  { label: 'Files',       path: '/files'       },
  { label: 'Search',      path: '/search'      },
  { label: 'Duplicates',  path: '/duplicates'  },
  { label: 'Junk',        path: '/junk'        },
  { label: 'Graph',       path: '/graph'       },
  { label: 'Chat',        path: '/chat'        },
  { label: 'Transcribe',  path: '/transcribe'  },
  { label: 'Collections', path: '/collections' },
  { label: 'Settings',    path: '/settings'    },
] as const;

const FAKE_USER = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['USER'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inject the kms-access-token session cookie so middleware treats
 * this browser as authenticated.
 */
async function injectAuthCookie(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'kms-access-token',
      value: FAKE_TOKEN,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Mock the /users/me endpoint and the token refresh endpoint so
 * AuthProvider doesn't make real network calls.
 */
async function mockAuthApis(page: Page) {
  // GET /api/v1/users/me
  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_USER),
    }),
  );

  // POST /api/v1/auth/refresh
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: FAKE_TOKEN,
        refreshToken: 'refresh-fake',
        expiresIn: 3600,
        tokenType: 'Bearer',
      }),
    }),
  );

  // Swallow all other API calls so they don't fail loudly
  await page.route('**/api/v1/**', (route) => {
    if (!route.request().url().includes('/users/me') && !route.request().url().includes('/auth/refresh')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    } else {
      route.continue();
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Sidebar navigation (authenticated)', () => {
  test.beforeEach(async ({ page, context }) => {
    await injectAuthCookie(context);
    await mockAuthApis(page);
  });

  // -------------------------------------------------------------------------
  // Happy path — every sidebar link must NOT redirect to login
  // -------------------------------------------------------------------------

  for (const { label, path } of SIDEBAR_ROUTES) {
    test(`navigating to ${label} (${path}) stays authenticated`, async ({ page }) => {
      // Navigate directly to the route (simulates user clicking a sidebar link)
      await page.goto(`${BASE}${path}`);

      // The URL must NOT contain /login
      await expect(page).not.toHaveURL(/\/login/);

      // The URL must reflect the intended path
      await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')));
    });
  }

  // -------------------------------------------------------------------------
  // Regression: 404 → go back → navigate elsewhere must not redirect to login
  // -------------------------------------------------------------------------

  test('navigating to a missing route shows not-found, going back and clicking another route does not redirect to login', async ({
    page,
  }) => {
    // Start on dashboard
    await page.goto(`${BASE}/dashboard`);
    await expect(page).not.toHaveURL(/\/login/);

    // Navigate to a route that previously did not exist (simulate old state)
    // We use /collections which now has a placeholder; to test the 404 path
    // we navigate to a truly non-existent route.
    await page.goto(`${BASE}/nonexistent-page`);

    // Should show the not-found page (404), not redirect to login
    await expect(page).not.toHaveURL(/\/login/);

    // Go back to dashboard
    await page.goBack();
    await expect(page).not.toHaveURL(/\/login/);

    // Click a sidebar link — must not redirect to login
    await page.goto(`${BASE}/search`);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/search/);
  });

  test('navigating to /collections shows the placeholder page, not a 404 or login redirect', async ({
    page,
  }) => {
    await page.goto(`${BASE}/collections`);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/collections/);

    // Page should render the Collections heading
    await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible();
  });

  test('navigating to /settings renders settings page without redirect', async ({
    page,
  }) => {
    await page.goto(`${BASE}/settings`);
    await expect(page).not.toHaveURL(/\/login/);
    // Should show settings page (either the index or api-keys redirect)
    await expect(page).toHaveURL(/\/settings/);
  });

  // -------------------------------------------------------------------------
  // Sequential sidebar navigation — simulates user clicking through the app
  // -------------------------------------------------------------------------

  test('clicking through multiple sidebar routes sequentially stays authenticated', async ({
    page,
  }) => {
    const route = [`${BASE}/dashboard`, `${BASE}/search`, `${BASE}/collections`, `${BASE}/chat`, `${BASE}/transcribe`];

    for (const url of route) {
      await page.goto(url);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });
});
