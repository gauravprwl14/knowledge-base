import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService, REDIS_CLIENT } from './cache.service';

/**
 * CacheModule provides a global Redis client (ioredis) and CacheService.
 *
 * Marked `@Global()` so that any feature module can inject `CacheService`
 * without importing CacheModule explicitly.
 *
 * The ioredis client is configured via ConfigService using these environment
 * variables:
 * - `REDIS_HOST`     — defaults to `localhost`
 * - `REDIS_PORT`     — defaults to `6379`
 * - `REDIS_PASSWORD` — optional
 * - `REDIS_DB`       — defaults to `0`
 *
 * The raw Redis client is also exported under the `REDIS_CLIENT` token for
 * modules that need low-level access (e.g., pub/sub, Lua scripting).
 *
 * @example
 * ```typescript
 * // In any service
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly cache: CacheService) {}
 * }
 * ```
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const client = new Redis({
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: config.get<number>('REDIS_PORT') ?? 6379,
          password: config.get<string>('REDIS_PASSWORD'),
          db: config.get<number>('REDIS_DB') ?? 0,
          lazyConnect: true,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            // Exponential back-off capped at 10 seconds
            if (times > 10) return null;
            return Math.min(times * 200, 10_000);
          },
        });

        client.on('error', (err: Error) => {
          // Log at bootstrap time — AppLogger is not available here
          console.error('[CacheModule] Redis error', err.message);
        });

        return client;
      },
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class CacheModule {}
