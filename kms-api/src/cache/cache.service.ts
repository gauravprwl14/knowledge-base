import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { AppLogger } from '../logger/logger.service';
import { AppError } from '../errors/types/app-error';
import { ERROR_CODES } from '../errors/error-codes';

/** Injection token for the ioredis client provided by CacheModule. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * CacheService provides a thin, typed wrapper around an ioredis client.
 *
 * Methods log and surface errors as `AppError` instances so callers
 * receive structured error responses rather than raw Redis exceptions.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class SomeService {
 *   constructor(private readonly cache: CacheService) {}
 *
 *   async getUser(id: string): Promise<UserDto | null> {
 *     const cached = await this.cache.get<UserDto>(`user:${id}`);
 *     if (cached) return cached;
 *     // ... fetch from DB, then cache
 *     await this.cache.set(`user:${id}`, user, 300);
 *     return user;
 *   }
 * }
 * ```
 */
@Injectable()
export class CacheService {
  private readonly logger: AppLogger;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: CacheService.name });
  }

  /**
   * Retrieves a cached value by key and deserialises it from JSON.
   *
   * @param key - Redis key to look up.
   * @returns The parsed value, or `null` if the key does not exist.
   * @throws AppError with code `SRV0005` on Redis error.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.error('Cache GET failed', { key, error: (err as Error).message });
      throw new AppError({
        code: ERROR_CODES.SRV.CACHE_ERROR.code,
        message: `Cache read failed for key: ${key}`,
        cause: err instanceof Error ? err : undefined,
      });
    }
  }

  /**
   * Stores a value in Redis as a JSON string with an optional TTL.
   *
   * @param key - Redis key.
   * @param value - Value to serialise and store.
   * @param ttlSeconds - Time-to-live in seconds. If omitted the key does not expire.
   * @throws AppError with code `SRV0005` on Redis error.
   */
  async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialised = JSON.stringify(value);
      if (ttlSeconds !== undefined) {
        await this.redis.setex(key, ttlSeconds, serialised);
      } else {
        await this.redis.set(key, serialised);
      }
    } catch (err) {
      this.logger.error('Cache SET failed', { key, error: (err as Error).message });
      throw new AppError({
        code: ERROR_CODES.SRV.CACHE_ERROR.code,
        message: `Cache write failed for key: ${key}`,
        cause: err instanceof Error ? err : undefined,
      });
    }
  }

  /**
   * Deletes one or more keys from Redis.
   *
   * @param keys - One or more Redis keys to remove.
   * @returns The number of keys actually deleted.
   * @throws AppError with code `SRV0005` on Redis error.
   */
  async del(...keys: string[]): Promise<number> {
    try {
      return await this.redis.del(...keys);
    } catch (err) {
      this.logger.error('Cache DEL failed', { keys, error: (err as Error).message });
      throw new AppError({
        code: ERROR_CODES.SRV.CACHE_ERROR.code,
        message: `Cache delete failed for keys: ${keys.join(', ')}`,
        cause: err instanceof Error ? err : undefined,
      });
    }
  }

  /**
   * Checks whether a key exists in Redis.
   *
   * @param key - Redis key to check.
   * @returns `true` if the key exists, `false` otherwise.
   * @throws AppError with code `SRV0005` on Redis error.
   */
  async exists(key: string): Promise<boolean> {
    try {
      const count = await this.redis.exists(key);
      return count > 0;
    } catch (err) {
      this.logger.error('Cache EXISTS failed', { key, error: (err as Error).message });
      throw new AppError({
        code: ERROR_CODES.SRV.CACHE_ERROR.code,
        message: `Cache exists check failed for key: ${key}`,
        cause: err instanceof Error ? err : undefined,
      });
    }
  }
}
