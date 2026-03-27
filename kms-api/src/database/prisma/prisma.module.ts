import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule provides the PrismaService globally across the application.
 * This ensures a single database connection is shared by all modules.
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [PrismaModule],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
