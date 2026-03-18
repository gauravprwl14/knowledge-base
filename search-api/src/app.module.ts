import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { PrismaModule } from './prisma/prisma.module';
import { SearchModule } from './search/search.module';
import { HealthModule } from './health/health.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * AppModule — root module for the search-api NestJS application.
 *
 * ### Responsibilities
 * - Loads environment variables via `ConfigModule.forRoot({ isGlobal: true })`.
 * - Registers {@link PrismaModule} globally so all feature modules can inject
 *   {@link PrismaService} without additional imports.
 * - Configures rate limiting via `ThrottlerModule` (health endpoints are
 *   excluded via `\@SkipThrottle()`).
 * - Applies the global {@link AllExceptionsFilter} to produce structured
 *   error responses.
 *
 * No JWT guards are registered here — authentication is handled upstream by
 * the kms-api gateway which forwards the `x-user-id` header.
 */
@Module({
  imports: [
    // Environment configuration — global so all modules can inject ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Structured JSON logging via pino
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),

    // Rate limiting: 100 requests per minute by default
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      },
    ]),

    // Global database access (marked @Global inside PrismaModule)
    PrismaModule,

    // Feature modules
    SearchModule,
    HealthModule,
  ],
  providers: [
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
