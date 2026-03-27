import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../../queue/queue.module';

/**
 * AdminModule — provides the admin dashboard API endpoints.
 *
 * Imports:
 * - AuthModule to make JwtAuthGuard and JwtModule available.
 * - QueueModule so AdminService can inject EmbedJobPublisher for reindexAll().
 *
 * AdminGuard is provided locally since it only applies to this module.
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [AdminModule],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [AuthModule, QueueModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
