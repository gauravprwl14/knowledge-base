import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AcpSessionStore, AcpSession } from './acp-session.store';
import { CacheService } from '../../cache/cache.service';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<AcpSession> = {}): AcpSession {
  return {
    sessionId: 'sess-001',
    userId: 'user-001',
    createdAt: new Date('2024-01-01').toISOString(),
    lastTouchedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('AcpSessionStore', () => {
  let store: AcpSessionStore;

  const cacheGet = jest.fn();
  const cacheSet = jest.fn();
  const cacheDel = jest.fn();

  const mockCache = {
    get: cacheGet,
    set: cacheSet,
    del: cacheDel,
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue('3600'),
  };

  const mockChildLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockLogger = {
    child: jest.fn().mockReturnValue(mockChildLogger),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcpSessionStore,
        { provide: CacheService, useValue: mockCache },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    store = module.get<AcpSessionStore>(AcpSessionStore);
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    it('stores session in Redis and returns session with userId and sessionId', async () => {
      cacheSet.mockResolvedValue(undefined);

      const result = await store.create('user-001', '/home/dev');

      expect(result.userId).toBe('user-001');
      expect(result.cwd).toBe('/home/dev');
      expect(result.sessionId).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.lastTouchedAt).toBeDefined();
      expect(cacheSet).toHaveBeenCalledWith(
        expect.stringContaining('kms:acp:session:'),
        expect.objectContaining({ userId: 'user-001' }),
        3600,
      );
    });

    it('creates session without cwd when not provided', async () => {
      cacheSet.mockResolvedValue(undefined);

      const result = await store.create('user-002');

      expect(result.userId).toBe('user-002');
      expect(result.cwd).toBeUndefined();
      expect(result.sessionId).toBeDefined();
    });

    it('generates a unique sessionId for each call', async () => {
      cacheSet.mockResolvedValue(undefined);

      const [a, b] = await Promise.all([
        store.create('user-001'),
        store.create('user-001'),
      ]);

      expect(a.sessionId).not.toBe(b.sessionId);
    });
  });

  // -------------------------------------------------------------------------
  // get()
  // -------------------------------------------------------------------------

  describe('get()', () => {
    it('returns session when it exists in cache', async () => {
      const session = makeSession();
      cacheGet.mockResolvedValue(session);
      cacheSet.mockResolvedValue(undefined);

      const result = await store.get('sess-001');

      expect(result.sessionId).toBe('sess-001');
      expect(result.userId).toBe('user-001');
      expect(cacheGet).toHaveBeenCalledWith('kms:acp:session:sess-001');
    });

    it('slides the TTL on every get() call (rolling window)', async () => {
      const session = makeSession();
      cacheGet.mockResolvedValue(session);
      cacheSet.mockResolvedValue(undefined);

      await store.get('sess-001');

      expect(cacheSet).toHaveBeenCalledWith(
        'kms:acp:session:sess-001',
        expect.any(Object),
        3600,
      );
    });

    it('updates lastTouchedAt on every get()', async () => {
      const oldTs = new Date('2024-01-01').toISOString();
      const session = makeSession({ lastTouchedAt: oldTs });
      cacheGet.mockResolvedValue(session);
      cacheSet.mockResolvedValue(undefined);

      const result = await store.get('sess-001');

      expect(result.lastTouchedAt).not.toBe(oldTs);
    });

    it('throws AppError EXT0012 when session does not exist', async () => {
      cacheGet.mockResolvedValue(null);

      await expect(store.get('nonexistent')).rejects.toThrow(AppError);

      try {
        await store.get('nonexistent');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).getStatus()).toBe(404);
        expect((err as AppError).code).toBe(ERROR_CODES.EXT.ACP_SESSION_NOT_FOUND.code);
      }
    });

    it('throws AppError EXT0012 for an expired session (cache returns null)', async () => {
      // Expired sessions are evicted by Redis TTL; cache returns null
      cacheGet.mockResolvedValue(null);

      await expect(store.get('expired-session')).rejects.toThrow(AppError);

      try {
        await store.get('expired-session');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ERROR_CODES.EXT.ACP_SESSION_NOT_FOUND.code);
      }
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('removes session from Redis', async () => {
      cacheDel.mockResolvedValue(1);

      await store.delete('sess-001');

      expect(cacheDel).toHaveBeenCalledWith('kms:acp:session:sess-001');
    });

    it('does not throw when deleting a non-existent session', async () => {
      cacheDel.mockResolvedValue(0);

      await expect(store.delete('nonexistent')).resolves.not.toThrow();
    });
  });
});
