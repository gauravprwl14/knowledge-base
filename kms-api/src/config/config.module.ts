import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envConfigSchema } from './schemas';
import { AppConfigService } from './config.service';

/**
 * Validates environment variables using Zod schema
 * @param config - Raw environment configuration object
 * @returns Validated and transformed configuration
 * @throws Error if validation fails
 */
function validateConfig(config: Record<string, unknown>) {
  const logger = new Logger('ConfigValidation');

  try {
    const validated = envConfigSchema.parse(config);
    logger.log('Environment configuration validated successfully');
    return validated;
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Environment configuration validation failed', error.message);

      // Extract Zod validation errors for better logging
      if ('errors' in error) {
        const zodErrors = (error as any).errors;
        for (const err of zodErrors) {
          logger.error(`  - ${err.path.join('.')}: ${err.message}`);
        }
      }
    }
    throw error;
  }
}

/**
 * ConfigurationModule provides validated configuration throughout the application.
 * Uses Zod for schema validation and provides type-safe access via AppConfigService.
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [ConfigurationModule],
 * })
 * export class AppModule {}
 *
 * // In any service
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly config: AppConfigService) {}
 *
 *   someMethod() {
 *     const port = this.config.app.port;
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validate: validateConfig,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigurationModule {}
