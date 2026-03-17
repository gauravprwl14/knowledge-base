import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';

/**
 * CollectionsModule encapsulates all REST endpoints and business logic for
 * KMS collections — named, user-owned groups of files.
 *
 * Imports DatabaseModule for PrismaService access. DatabaseModule is @Global
 * so this import is optional in practice, but included explicitly for
 * readability and testability.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
