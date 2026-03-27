import { Test, TestingModule } from '@nestjs/testing';
import { CacheService, REDIS_CLIENT } from './cache.service';
import { AppLogger } from '../logger/logger.service';
import { AppError } from '../errors/types/app-error';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
};

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(CacheService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('get', () => {
    it('returns parsed JSON for an existing key', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ name: 'test' }));
      const result = await service.get<{ name: string }>('my:key');
      expect(result).toEqual({ name: 'test' });
    });

    it('returns null for a missing key', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.get('missing');
      expect(result).toBeNull();
    });

    it('throws AppError on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('connection lost'));
      await expect(service.get('key')).rejects.toThrow(AppError);
    });
  });

  describe('set', () => {
    it('calls setex when ttlSeconds is provided', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      await service.set('k', { val: 1 }, 60);
      expect(mockRedis.setex).toHaveBeenCalledWith('k', 60, JSON.stringify({ val: 1 }));
    });

    it('calls set (no TTL) when ttlSeconds is omitted', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.set('k', 'hello');
      expect(mockRedis.set).toHaveBeenCalledWith('k', JSON.stringify('hello'));
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('throws AppError on Redis write error', async () => {
      mockRedis.set.mockRejectedValue(new Error('OOM'));
      await expect(service.set('k', 'v')).rejects.toThrow(AppError);
    });
  });

  describe('del', () => {
    it('returns count of deleted keys', async () => {
      mockRedis.del.mockResolvedValue(2);
      const count = await service.del('k1', 'k2');
      expect(count).toBe(2);
    });

    it('throws AppError on Redis del error', async () => {
      mockRedis.del.mockRejectedValue(new Error('err'));
      await expect(service.del('k')).rejects.toThrow(AppError);
    });
  });

  describe('exists', () => {
    it('returns true when key exists (count > 0)', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.exists('k')).toBe(true);
    });

    it('returns false when key does not exist (count === 0)', async () => {
      mockRedis.exists.mockResolvedValue(0);
      expect(await service.exists('k')).toBe(false);
    });

    it('throws AppError on Redis error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('err'));
      await expect(service.exists('k')).rejects.toThrow(AppError);
    });
  });
});
