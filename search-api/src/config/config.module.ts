import { Module, Global } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { configSchema } from "./config.schema";

/**
 * Global ConfigModule — validates env vars with Zod at startup and makes
 * NestJS ConfigService available application-wide without re-importing.
 *
 * Usage in services:
 * ```typescript
 * constructor(private readonly config: ConfigService) {}
 * const port = this.config.get<number>('PORT');
 * ```
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      // Parse and validate all env vars using Zod — crash on invalid config
      validate: (rawEnv) => {
        const result = configSchema.safeParse(rawEnv);
        if (!result.success) {
          throw new Error(
            `[search-api] Invalid environment configuration:\n${result.error.toString()}`,
          );
        }
        return result.data;
      },
      isGlobal: true,
      // Load .env file in non-production environments
      ignoreEnvFile: process.env.NODE_ENV === "production",
    }),
  ],
})
export class AppConfigModule {}
