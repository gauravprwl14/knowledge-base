/**
 * auth.api.test.ts
 *
 * Unit tests for the auth API wrapper functions.
 * Covers: login(), getMe() — response mapping, URL, method.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Prevent mock handlers from being imported (they use MSW which is not needed)
jest.mock('@/lib/mock/handlers/auth.mock', () => ({
  mockLogin: jest.fn(),
  mockRegister: jest.fn(),
  mockLogout: jest.fn(),
  mockGetMe: jest.fn(),
  mockListApiKeys: jest.fn(),
  mockCreateApiKey: jest.fn(),
  mockRevokeApiKey: jest.fn(),
}));

// Mock the API client — jest.fn() lives inside the factory to avoid hoisting issues.
jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    setTokenProvider: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { login, getMe } from '@/lib/api/auth.api';
import { apiClient } from '@/lib/api/client';

// Typed mock references — available after imports are resolved
const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth.api', () => {
  // -------------------------------------------------------------------------
  // login()
  // -------------------------------------------------------------------------

  describe('login()', () => {
    it('calls POST /auth/login with the supplied credentials', async () => {
      // Arrange
      mockPost.mockResolvedValue({
        tokens: { accessToken: 'tok', refreshToken: 'ref', expiresIn: 3600, tokenType: 'Bearer' },
        user: { id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'USER' },
      });

      // Act
      await login({ email: 'a@b.com', password: 'pass' });

      // Assert
      expect(mockPost).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'pass' });
    });

    it('maps nested tokens.accessToken to flat accessToken in the returned object', async () => {
      // Arrange
      const rawResponse = {
        tokens: {
          accessToken: 'access-jwt',
          refreshToken: 'refresh-jwt',
          expiresIn: 3600,
          tokenType: 'Bearer',
        },
        user: { id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'USER' },
      };
      mockPost.mockResolvedValue(rawResponse);

      // Act
      const result = await login({ email: 'a@b.com', password: 'pass' });

      // Assert — nested shape is flattened
      expect(result.accessToken).toBe('access-jwt');
      expect(result.expiresIn).toBe(3600);
      // Should NOT contain the nested tokens object
      expect((result as Record<string, unknown>).tokens).toBeUndefined();
    });

    it('maps nested tokens.refreshToken to flat refreshToken in the returned object', async () => {
      // Arrange — regression test: refreshToken must NOT be dropped
      const rawResponse = {
        tokens: {
          accessToken: 'access-jwt',
          refreshToken: 'refresh-jwt-456',
          expiresIn: 900,
          tokenType: 'Bearer',
        },
        user: { id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'USER' },
      };
      mockPost.mockResolvedValue(rawResponse);

      // Act
      const result = await login({ email: 'a@b.com', password: 'pass' });

      // Assert
      expect(result.refreshToken).toBe('refresh-jwt-456');
      expect(result).toHaveProperty('refreshToken');
    });

    it('returns expiresIn from the tokens payload', async () => {
      // Arrange
      mockPost.mockResolvedValue({
        tokens: { accessToken: 'tok', refreshToken: 'ref', expiresIn: 1800, tokenType: 'Bearer' },
        user: { id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'USER' },
      });

      // Act
      const result = await login({ email: 'a@b.com', password: 'pass' });

      // Assert
      expect(result.expiresIn).toBe(1800);
    });
  });

  // -------------------------------------------------------------------------
  // getMe()
  // -------------------------------------------------------------------------

  describe('getMe()', () => {
    it('calls GET /users/me', async () => {
      // Arrange
      mockGet.mockResolvedValue({
        id: '1',
        email: 'x@y.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'ADMIN',
        emailVerified: true,
        createdAt: '2024-01-01T00:00:00Z',
      });

      // Act
      await getMe();

      // Assert
      expect(mockGet).toHaveBeenCalledWith('/users/me');
    });

    it('maps firstName + lastName to a combined name field', async () => {
      // Arrange
      mockGet.mockResolvedValue({
        id: '2',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        emailVerified: true,
        createdAt: '2024-01-01T00:00:00Z',
      });

      // Act
      const user = await getMe();

      // Assert
      expect(user.name).toBe('John Doe');
    });

    it('maps role to a roles array', async () => {
      // Arrange
      mockGet.mockResolvedValue({
        id: '3',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: null,
        role: 'ADMIN',
        emailVerified: true,
        createdAt: '2024-01-01T00:00:00Z',
      });

      // Act
      const user = await getMe();

      // Assert — role wraps in array
      expect(user.roles).toEqual(['ADMIN']);
    });

    it('falls back to email when both firstName and lastName are null', async () => {
      // Arrange
      mockGet.mockResolvedValue({
        id: '4',
        email: 'noname@example.com',
        firstName: null,
        lastName: null,
        role: 'USER',
        emailVerified: false,
        createdAt: '2024-01-01T00:00:00Z',
      });

      // Act
      const user = await getMe();

      // Assert
      expect(user.name).toBe('noname@example.com');
    });

    it('uses firstName only when lastName is null', async () => {
      // Arrange
      mockGet.mockResolvedValue({
        id: '5',
        email: 'firstonly@example.com',
        firstName: 'Alice',
        lastName: null,
        role: 'USER',
        emailVerified: true,
        createdAt: '2024-01-01T00:00:00Z',
      });

      // Act
      const user = await getMe();

      // Assert
      expect(user.name).toBe('Alice');
    });
  });
});
