/**
 * Configuration Schemas
 *
 * Zod schemas for validating environment configuration.
 * These schemas ensure type-safe configuration throughout the application.
 *
 * @example
 * ```typescript
 * import { envConfigSchema, AppConfig, AuthConfig } from '@config/schemas';
 *
 * const config = envConfigSchema.parse(process.env);
 * ```
 */

export * from './app.schema';
