import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { QueueModule } from '../../queue/queue.module';
import { FilesController } from './files.controller';
import { ScanController } from './scan.controller';
import { ScanJobsController } from './scan-jobs.controller';
import { FilesService } from './files.service';
import { FileRepository } from '../../database/repositories/file.repository';
import { MinioService } from './minio.service';

/**
 * FilesModule — encapsulates REST endpoints and business logic for KMS file
 * management and scan job orchestration.
 *
 * Provides:
 *   - FilesController: GET /files, GET /files/:id, DELETE /files/:id,
 *     POST /files/bulk-delete, POST /files/bulk-move,
 *     GET /files/:id/transcription/url, GET /files/:id/transcription/text
 *   - ScanController: POST /sources/:sourceId/scan
 *   - ScanJobsController: GET /sources/:sourceId/scan-history
 *   - FilesService: ownership-scoped business logic
 *   - FileRepository: Prisma data-access layer
 *   - MinioService: MinIO SDK wrapper for transcript object storage
 *
 * DatabaseModule is imported for PrismaService.
 * QueueModule is imported so ScanJobPublisher is available.
 */
@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [FilesController, ScanController, ScanJobsController],
  providers: [FilesService, FileRepository, MinioService],
  exports: [FilesService, FileRepository, MinioService],
})
export class FilesModule {}
