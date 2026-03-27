import { z } from 'zod';

/**
 * Application configuration schema
 * Validates core application settings
 */
export const appConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  APP_NAME: z.string().min(1).default('kms-api'),
  APP_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  APP_HOST: z.string().ip().or(z.literal('0.0.0.0')).default('0.0.0.0'),
  API_PREFIX: z.string().min(1).default('api'),
  API_VERSION: z.string().regex(/^v\d+$/).default('v1'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

/**
 * Database configuration schema
 * Validates PostgreSQL connection settings
 */
export const databaseConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
      { message: 'DATABASE_URL must be a valid PostgreSQL connection string' },
    ),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

/**
 * Redis configuration schema
 * Validates Redis connection settings
 */
export const redisConfigSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
});

export type RedisConfig = z.infer<typeof redisConfigSchema>;

/**
 * Queue configuration schema
 * Validates RabbitMQ/Bull queue settings
 */
export const queueConfigSchema = z.object({
  QUEUE_HOST: z.string().min(1).default('localhost'),
  QUEUE_PORT: z.coerce.number().int().min(1).max(65535).default(5672),
  QUEUE_USER: z.string().min(1).default('guest'),
  QUEUE_PASSWORD: z.string().default('guest'),
});

export type QueueConfig = z.infer<typeof queueConfigSchema>;

/**
 * Authentication configuration schema
 * Validates JWT and API key settings
 */
export const authConfigSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRATION: z.string().regex(/^\d+[smhd]$/).default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRATION: z.string().regex(/^\d+[smhd]$/).default('7d'),
  API_KEY_ENCRYPTION_SECRET: z
    .string()
    .min(32, 'API_KEY_ENCRYPTION_SECRET must be at least 32 characters'),
  // Google OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;

/**
 * OpenTelemetry configuration schema
 * Validates observability settings
 */
export const otelConfigSchema = z.object({
  OTEL_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .pipe(z.boolean())
    .default('true'),
  OTEL_SERVICE_NAME: z.string().min(1).default('kms-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4317'),
  OTEL_EXPORTER_OTLP_PROTOCOL: z.enum(['grpc', 'http/protobuf', 'http/json']).default('grpc'),
  JAEGER_ENDPOINT: z.string().url().optional(),
});

export type OtelConfig = z.infer<typeof otelConfigSchema>;

/**
 * Rate limiting configuration schema
 */
export const throttleConfigSchema = z.object({
  THROTTLE_TTL: z.coerce.number().int().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(100),
});

export type ThrottleConfig = z.infer<typeof throttleConfigSchema>;

/**
 * CORS configuration schema
 */
export const corsConfigSchema = z.object({
  CORS_ORIGINS: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .pipe(z.array(z.string()))
    .default('http://localhost:3000'),
});

export type CorsConfig = z.infer<typeof corsConfigSchema>;

/**
 * External services configuration schema
 */
export const servicesConfigSchema = z.object({
  VOICE_APP_URL: z.string().url().optional(),
  SEARCH_API_URL: z.string().url().optional(),
});

export type ServicesConfig = z.infer<typeof servicesConfigSchema>;

/**
 * Complete environment configuration schema
 * Combines all configuration schemas
 */
export const envConfigSchema = appConfigSchema
  .merge(databaseConfigSchema)
  .merge(redisConfigSchema)
  .merge(queueConfigSchema)
  .merge(authConfigSchema)
  .merge(otelConfigSchema)
  .merge(throttleConfigSchema)
  .merge(corsConfigSchema)
  .merge(servicesConfigSchema);

export type EnvConfig = z.infer<typeof envConfigSchema>;
