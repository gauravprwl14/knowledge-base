import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// Core modules
import { ConfigurationModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

// Feature modules
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { SourcesModule } from './modules/sources/sources.module';
import { FilesModule } from './modules/files/files.module';
import { SearchModule } from './modules/search/search.module';
import { AgentsModule } from './modules/agents/agents.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { TagsModule } from './modules/tags/tags.module';
import { AcpModule } from './modules/acp/acp.module';
import { WorkflowModule } from './modules/workflow/workflow.module';

// Infrastructure modules
import { QueueModule } from './queue/queue.module';
import { CacheModule } from './cache/cache.module';

// Common
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';

// Guards
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

/**
 * AppModule - Root application module
 *
 * Configures:
 * - Global modules (Config, Database, Logger, Telemetry, Queue, Cache)
 * - Feature modules (Auth, Health, Sources, Files, Search, Agents, Collections, Tags, ACP, Workflow)
 * - Global filters, interceptors, guards, and middleware
 * - Rate limiting with Throttler
 */
@Module({
  imports: [
    // Core modules
    ConfigurationModule,
    DatabaseModule,
    LoggerModule,
    PinoLoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL || 'info' } }),
    TelemetryModule.forRoot(),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      },
    ]),

    // Infrastructure — global Redis cache and AMQP queues
    // QueueModule must be imported BEFORE WorkflowModule so the AMQP connection is registered first
    CacheModule,
    QueueModule,

    // Feature flags — global, must be registered before feature modules
    FeatureFlagsModule,

    // Feature modules
    AuthModule,
    UsersModule,
    HealthModule,
    SourcesModule,
    FilesModule,
    SearchModule,
    AgentsModule,
    CollectionsModule,
    TagsModule,
    AcpModule,
    WorkflowModule,
  ],
  providers: [
    // Global exception filters — order matters: registered last = runs first.
    // PrismaExceptionFilter intercepts Prisma errors before AllExceptionsFilter.
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },

    // Global interceptors (order matters - executed in reverse)
    {
      provide: APP_INTERCEPTOR,
      useFactory: () => new TimeoutInterceptor(30000),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },

    // Global guards
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Configures global middleware
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, SecurityHeadersMiddleware)
      .forRoutes('*');
  }
}
