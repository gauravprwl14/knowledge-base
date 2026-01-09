import { Injectable, Logger } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import {
  EnvConfig,
  AppConfig,
  DatabaseConfig,
  RedisConfig,
  QueueConfig,
  AuthConfig,
  OtelConfig,
  ThrottleConfig,
  CorsConfig,
  ServicesConfig,
} from './schemas';

/**
 * AppConfigService provides type-safe access to validated configuration.
 * Wraps NestJS ConfigService with strongly typed getters.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly config: AppConfigService) {}
 *
 *   someMethod() {
 *     const port = this.config.app.port;
 *     const jwtSecret = this.config.auth.jwtAccessSecret;
 *   }
 * }
 * ```
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(private readonly configService: NestConfigService<EnvConfig, true>) {
    this.logger.log('Configuration service initialized');
  }

  /**
   * Application configuration
   */
  get app(): {
    nodeEnv: string;
    name: string;
    port: number;
    host: string;
    apiPrefix: string;
    apiVersion: string;
    logLevel: string;
  } {
    return {
      nodeEnv: this.configService.get('NODE_ENV'),
      name: this.configService.get('APP_NAME'),
      port: this.configService.get('APP_PORT'),
      host: this.configService.get('APP_HOST'),
      apiPrefix: this.configService.get('API_PREFIX'),
      apiVersion: this.configService.get('API_VERSION'),
      logLevel: this.configService.get('LOG_LEVEL'),
    };
  }

  /**
   * Database configuration
   */
  get database(): {
    url: string;
  } {
    return {
      url: this.configService.get('DATABASE_URL'),
    };
  }

  /**
   * Redis configuration
   */
  get redis(): {
    host: string;
    port: number;
    password: string;
    db: number;
  } {
    return {
      host: this.configService.get('REDIS_HOST'),
      port: this.configService.get('REDIS_PORT'),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB'),
    };
  }

  /**
   * Queue configuration
   */
  get queue(): {
    host: string;
    port: number;
    user: string;
    password: string;
  } {
    return {
      host: this.configService.get('QUEUE_HOST'),
      port: this.configService.get('QUEUE_PORT'),
      user: this.configService.get('QUEUE_USER'),
      password: this.configService.get('QUEUE_PASSWORD'),
    };
  }

  /**
   * Authentication configuration
   */
  get auth(): {
    jwtAccessSecret: string;
    jwtAccessExpiration: string;
    jwtRefreshSecret: string;
    jwtRefreshExpiration: string;
    apiKeyEncryptionSecret: string;
    googleClientId?: string;
    googleClientSecret?: string;
    googleCallbackUrl?: string;
  } {
    return {
      jwtAccessSecret: this.configService.get('JWT_ACCESS_SECRET'),
      jwtAccessExpiration: this.configService.get('JWT_ACCESS_EXPIRATION'),
      jwtRefreshSecret: this.configService.get('JWT_REFRESH_SECRET'),
      jwtRefreshExpiration: this.configService.get('JWT_REFRESH_EXPIRATION'),
      apiKeyEncryptionSecret: this.configService.get('API_KEY_ENCRYPTION_SECRET'),
      googleClientId: this.configService.get('GOOGLE_CLIENT_ID'),
      googleClientSecret: this.configService.get('GOOGLE_CLIENT_SECRET'),
      googleCallbackUrl: this.configService.get('GOOGLE_CALLBACK_URL'),
    };
  }

  /**
   * OpenTelemetry configuration
   */
  get otel(): {
    enabled: boolean;
    serviceName: string;
    exporterEndpoint: string;
    exporterProtocol: string;
    jaegerEndpoint?: string;
  } {
    return {
      enabled: this.configService.get('OTEL_ENABLED'),
      serviceName: this.configService.get('OTEL_SERVICE_NAME'),
      exporterEndpoint: this.configService.get('OTEL_EXPORTER_OTLP_ENDPOINT'),
      exporterProtocol: this.configService.get('OTEL_EXPORTER_OTLP_PROTOCOL'),
      jaegerEndpoint: this.configService.get('JAEGER_ENDPOINT'),
    };
  }

  /**
   * Rate limiting configuration
   */
  get throttle(): {
    ttl: number;
    limit: number;
  } {
    return {
      ttl: this.configService.get('THROTTLE_TTL'),
      limit: this.configService.get('THROTTLE_LIMIT'),
    };
  }

  /**
   * CORS configuration
   */
  get cors(): {
    origins: string[];
  } {
    return {
      origins: this.configService.get('CORS_ORIGINS'),
    };
  }

  /**
   * External services configuration
   */
  get services(): {
    voiceAppUrl?: string;
    searchApiUrl?: string;
  } {
    return {
      voiceAppUrl: this.configService.get('VOICE_APP_URL'),
      searchApiUrl: this.configService.get('SEARCH_API_URL'),
    };
  }

  /**
   * Check if running in development environment
   */
  get isDevelopment(): boolean {
    return this.app.nodeEnv === 'development';
  }

  /**
   * Check if running in production environment
   */
  get isProduction(): boolean {
    return this.app.nodeEnv === 'production';
  }

  /**
   * Check if running in test environment
   */
  get isTest(): boolean {
    return this.app.nodeEnv === 'test';
  }

  /**
   * Get the full API path prefix
   */
  get apiPath(): string {
    return `${this.app.apiPrefix}/${this.app.apiVersion}`;
  }

  /**
   * Get raw configuration value by key
   * Use typed getters above when possible
   */
  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.configService.get(key);
  }
}
