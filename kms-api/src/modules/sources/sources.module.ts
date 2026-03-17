import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { TokenEncryptionService } from './token-encryption.service';

/**
 * SourcesModule encapsulates all functionality related to managing knowledge
 * sources (local folders, Google Drive, S3, etc.).
 *
 * DatabaseModule is @Global so SourceRepository and PrismaService are
 * injected without an explicit import, but the import is kept for clarity.
 *
 * Providers:
 * - SourcesService        — business logic (OAuth, CRUD)
 * - TokenEncryptionService — AES-256-GCM encryption for OAuth tokens
 * SourceRepository is provided by the global DatabaseModule.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [SourcesController],
  providers: [SourcesService, TokenEncryptionService],
  exports: [SourcesService],
})
export class SourcesModule {}
