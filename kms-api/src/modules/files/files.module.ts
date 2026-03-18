import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { QueueModule } from '../../queue/queue.module';
import { FilesController } from './files.controller';
import { ScanController } from './scan.controller';
import { ScanJobsController } from './scan-jobs.controller';
import { FilesService } from './files.service';
import { FileRepository } from '../../database/repositories/file.repository';

/**
<<<<<<< HEAD
 * FilesModule encapsulates REST endpoints and business logic for KMS file
 * management and scan job orchestration.
 *
 * Provides:
 * - GET  /files                          — paginated file listing
 * - GET  /files/:id                      — single file lookup
 * - POST /sources/:sourceId/scan         — trigger a scan job
 * - GET  /sources/:sourceId/scan-history — past scan jobs for a source
 *
 * DatabaseModule is @Global so the explicit import is for readability.
 * QueueModule is @Global so ScanJobPublisher is already available, but we
 * import it explicitly here for clarity.
 */
@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [FilesController, ScanController, ScanJobsController],
  providers: [FilesService],
  exports: [FilesService],
=======
 * FilesModule — encapsulates REST endpoints and business logic for KMS file
 * management.
 *
 * Provides:
 *   - FilesController: GET /files, GET /files/:id, DELETE /files/:id,
 *     POST /files/bulk-delete, POST /files/bulk-move
 *   - FilesService: ownership-scoped business logic
 *   - FileRepository: Prisma data-access layer
 *
 * DatabaseModule is imported for PrismaService; it is @Global in production
 * but imported explicitly for testability.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [FilesController],
  providers: [FilesService, FileRepository],
  exports: [FilesService, FileRepository],
>>>>>>> feat/drive-backend
})
export class FilesModule {}
