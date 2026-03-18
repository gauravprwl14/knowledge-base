import { z } from 'zod';

/**
 * Zod schema that validates all environment variables required by search-api.
 * Validation runs at startup — missing required vars crash early with a clear message.
 */
export const configSchema = z.object({
  // Server binding port (default 8001 to avoid collision with kms-api on 3000)
  PORT: z.coerce.number().default(8001),

  // Runtime environment controls log level and seed endpoint availability
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // PostgreSQL connection string — used by Prisma for BM25 raw queries
  DATABASE_URL: z.string().url().optional(),

  // Qdrant base URL — used for semantic ANN queries
  QDRANT_URL: z.string().url().default('http://localhost:6333'),

  // Qdrant collection name that holds kms chunk vectors
  QDRANT_COLLECTION: z.string().default('kms_chunks'),

  // When true, BM25 service returns hardcoded mock results (no DB needed)
  MOCK_BM25: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('true'),

  // When true, semantic service returns deterministic mock results (no Qdrant needed)
  MOCK_SEMANTIC: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('true'),

  // Pino log level
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

/** Inferred type of the validated config object. */
export type AppConfig = z.infer<typeof configSchema>;
