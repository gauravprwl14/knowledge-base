import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { QueueModule } from '../../queue/queue.module';
import { FilesController } from './files.controller';
import { ScanController } from './scan.controller';
import { ScanJobsController } from './scan-jobs.controller';
import { FilesService } from './files.service';

/**
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
})
export class FilesModule {}
