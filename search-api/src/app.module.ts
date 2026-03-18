import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { SearchModule } from './search/search.module';
import { HealthController } from './health/health.controller';

/**
 * AppModule is the root NestJS module for search-api.
 *
 * Module composition:
 * - `AppConfigModule`  — global Zod-validated env config (imported once here)
 * - `LoggerModule`     — nestjs-pino structured JSON logger (global, transport depends on NODE_ENV)
 * - `SearchModule`     — POST /search, POST /search/seed
 * - `HealthController` — GET /health (registered directly; no sub-module needed)
 */
@Module({
  imports: [
    // Global config module — validates env vars at startup via Zod schema
    AppConfigModule,

    // Pino structured logger — JSON in production, pretty-printed in development
    LoggerModule.forRoot({
      pinoHttp: {
        // Log level from env (falls back to 'info' if not set at this point)
        level: process.env.LOG_LEVEL ?? 'info',
        // Redact sensitive headers from access logs
        redact: ['req.headers.authorization', 'req.headers["x-user-id"]'],
        // Use pretty printing in non-production for developer ergonomics
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        // Attach request ID to every log line for trace correlation
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
      },
    }),

    // Feature modules
    SearchModule,
  ],
  // HealthController registered at the root level so it maps to GET /health
  controllers: [HealthController],
})
export class AppModule {}
