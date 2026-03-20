/**
 * auth.store.test.ts
 *
 * Unit tests for the TanStack Store-based auth store.
 * Covers: login, logout, setAccessToken, cookie helpers, singleton behaviour.
 *
 * @jest-environment node
 *
 * Uses node environment to avoid the jsdom/Node 24 EventTarget crash.
 * document.cookie is mocked manually inside each test that needs it.
 */

// ---------------------------------------------------------------------------
// Mocks — factories may NOT reference variables declared outside them.
// The Store mock is self-contained: it manages state in `this.state`.
// Tests read state via `authStore.state` (the actual exported singleton).
// ---------------------------------------------------------------------------

jest.mock('@tanstack/store', () => {
  class Store<T extends object> {
    state: T;
    constructor(initial: T) {
      this.state = { ...initial };
    }
    setState(updater: (prev: T) => T) {
      this.state = updater(this.state);
    }
  }
  return { Store };
});

jest.mock('@tanstack/react-store', () => ({
  useStore: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  authStore,
  login,
  logout,
  setAccessToken,
} from '@/lib/stores/auth.store';
import type { AuthUser } from '@/lib/stores/auth.store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (overrides?: Partial<AuthUser>): AuthUser => ({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['USER'],
  ...overrides,
});

const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth.store', () => {
  // Reset to initial state before each test
  beforeEach(() => {
    // Set up a minimal document mock (node environment has no DOM)
    if (typeof global.document === 'undefined') {
      const cookieStore: string[] = [];
      Object.defineProperty(global, 'document', {
        value: Object.defineProperty({}, 'cookie', {
          get: () => cookieStore.join(';'),
          set: (val: string) => cookieStore.push(val),
          configurable: true,
        }),
        configurable: true,
        writable: true,
      });
    }

    authStore.setState(() => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    }));
  });

  // -------------------------------------------------------------------------
  // login()
  // -------------------------------------------------------------------------

  describe('login()', () => {
    it('sets user, accessToken, and isAuthenticated=true on the store', () => {
      // Arrange
      const user = makeUser();

      // Act
      login(user, TEST_TOKEN);

      // Assert
      expect(authStore.state.user).toEqual(user);
      expect(authStore.state.accessToken).toBe(TEST_TOKEN);
      expect(authStore.state.isAuthenticated).toBe(true);
    });

    it('sets the kms-access-token cookie when document is available', () => {
      // Arrange
      const cookieValues: string[] = [];
      Object.defineProperty(document, 'cookie', {
        get: () => '',
        set: (val: string) => {
          cookieValues.push(val);
        },
        configurable: true,
      });

      // Act
      login(makeUser(), TEST_TOKEN);

      // Assert — at least one cookie write should reference our token
      const written = cookieValues.join(';');
      expect(written).toContain('kms-access-token');
      expect(written).toContain(TEST_TOKEN);
    });

    it('does NOT set cookie when document is undefined (SSR guard)', () => {
      // Arrange — simulate SSR by removing `document`
      const cookieValues: string[] = [];
      const originalDocument = global.document;
      // @ts-expect-error — intentionally removing document to simulate SSR
      delete global.document;

      // Act
      login(makeUser(), TEST_TOKEN);

      // Assert — store state is updated, but no cookie write
      expect(authStore.state.isAuthenticated).toBe(true);
      expect(cookieValues).toHaveLength(0);

      // Restore
      global.document = originalDocument;
    });
  });

  // -------------------------------------------------------------------------
  // logout()
  // -------------------------------------------------------------------------

  describe('logout()', () => {
    it('clears user, accessToken, and isAuthenticated from the store', () => {
      // Arrange — populate the store
      login(makeUser(), TEST_TOKEN);
      expect(authStore.state.isAuthenticated).toBe(true);

      // Act
      logout();

      // Assert
      expect(authStore.state.user).toBeNull();
      expect(authStore.state.accessToken).toBeNull();
      expect(authStore.state.isAuthenticated).toBe(false);
    });

    it('clears the kms-access-token cookie (max-age=0)', () => {
      // Arrange
      const cookieValues: string[] = [];
      Object.defineProperty(document, 'cookie', {
        get: () => `kms-access-token=${TEST_TOKEN}`,
        set: (val: string) => {
          cookieValues.push(val);
        },
        configurable: true,
      });

      // Act
      logout();

      // Assert — the cookie expiration write should contain max-age=0
      const clearWrite = cookieValues.find((c) => c.includes('max-age=0'));
      expect(clearWrite).toBeDefined();
    });

    it('does NOT write cookie when document is undefined (SSR guard)', () => {
      // Arrange
      const cookieValues: string[] = [];
      const originalDocument = global.document;
      // @ts-expect-error — intentionally removing document to simulate SSR
      delete global.document;

      // Act
      logout();

      // Assert
      expect(authStore.state.isAuthenticated).toBe(false);
      expect(cookieValues).toHaveLength(0);

      // Restore
      global.document = originalDocument;
    });
  });

  // -------------------------------------------------------------------------
  // setAccessToken()
  // -------------------------------------------------------------------------

  describe('setAccessToken()', () => {
    it('updates the access token without changing user or isAuthenticated', () => {
      // Arrange
      const user = makeUser();
      login(user, TEST_TOKEN);

      const newToken = 'new-access-token-xyz';

      // Act
      setAccessToken(newToken);

      // Assert
      expect(authStore.state.accessToken).toBe(newToken);
      expect(authStore.state.user).toEqual(user);
      expect(authStore.state.isAuthenticated).toBe(true);
    });

    it('updates the kms-access-token cookie with the new token', () => {
      // Arrange
      login(makeUser(), TEST_TOKEN);
      const newToken = 'refreshed-token';

      const cookieValues: string[] = [];
      Object.defineProperty(document, 'cookie', {
        get: () => `kms-access-token=${TEST_TOKEN}`,
        set: (val: string) => {
          cookieValues.push(val);
        },
        configurable: true,
      });

      // Act
      setAccessToken(newToken);

      // Assert
      const written = cookieValues.join(';');
      expect(written).toContain('kms-access-token');
      expect(written).toContain(newToken);
    });
  });

  // -------------------------------------------------------------------------
  // Singleton behaviour
  // -------------------------------------------------------------------------

  describe('store singleton', () => {
    it('is the same object reference when imported multiple times', async () => {
      // Arrange — re-import the module (Node module cache ensures same object)
      const { authStore: storeA } = await import('@/lib/stores/auth.store');
      const { authStore: storeB } = await import('@/lib/stores/auth.store');

      // Assert — same reference
      expect(storeA).toBe(storeB);
    });

    it('state changes via login() are visible via authStore.state', () => {
      // Arrange
      const user = makeUser({ email: 'singleton@example.com' });

      // Act
      login(user, 'token-singleton');

      // Assert
      expect(authStore.state.user?.email).toBe('singleton@example.com');
    });
  });
});
