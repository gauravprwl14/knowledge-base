import { Global, Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { UserRepository } from './repositories/user.repository';
import { ApiKeyRepository } from './repositories/api-key.repository';
import { AuditLogRepository } from './repositories/audit-log.repository';

/**
 * DatabaseModule provides database access throughout the application.
 * Includes PrismaService and all repository classes.
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [DatabaseModule],
 * })
 * export class AppModule {}
 *
 * // In any service
 * @Injectable()
 * export class MyService {
 *   constructor(
 *     private readonly userRepository: UserRepository,
 *     private readonly prisma: PrismaService,
 *   ) {}
 * }
 * ```
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    UserRepository,
    ApiKeyRepository,
    AuditLogRepository,
  ],
  exports: [
    PrismaModule,
    PrismaService,
    UserRepository,
    ApiKeyRepository,
    AuditLogRepository,
  ],
})
export class DatabaseModule {}
