import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

/**
 * SourcesModule encapsulates all functionality related to managing knowledge
 * sources (local folders, Google Drive, S3, etc.).
 *
 * Imports DatabaseModule to gain access to PrismaService and all repositories.
 * DatabaseModule is @Global so this import is optional in practice, but is
 * included explicitly for clarity.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [SourcesController],
  providers: [SourcesService],
  exports: [SourcesService],
})
export class SourcesModule {}
