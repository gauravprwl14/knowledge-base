import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileRepository } from '../../database/repositories/file.repository';

/**
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
})
export class FilesModule {}
