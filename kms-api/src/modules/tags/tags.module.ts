import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { TagsRepository } from './tags.repository';

/**
 * TagsModule — encapsulates the relational tag system for KMS files.
 *
 * Provides:
 *   - TagsController: GET/POST/DELETE /tags, POST/DELETE /files/:fileId/tags/:tagId,
 *                     POST /files/bulk-tag
 *   - TagsService: ownership-scoped business logic with limit enforcement
 *   - TagsRepository: Prisma data-access layer for kms_tags and kms_file_tags
 *
 * DatabaseModule provides PrismaService. TagsService is exported so other
 * modules (e.g. a future AI pipeline) can apply tags programmatically.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [TagsController],
  providers: [TagsService, TagsRepository],
  exports: [TagsService],
})
export class TagsModule {}
