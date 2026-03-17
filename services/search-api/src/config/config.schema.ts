import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  KMS_API_URL: z.string().default('http://kms-api:8000'),
  QDRANT_URL: z.string().default('http://qdrant:6333'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://otel-collector:4317'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  SEARCH_RESULT_LIMIT_MAX: z.coerce.number().default(100),
  SEARCH_DEFAULT_LIMIT: z.coerce.number().default(20),
});

export type AppConfig = z.infer<typeof configSchema>;
