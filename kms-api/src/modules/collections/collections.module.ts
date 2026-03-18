import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CollectionsRepository } from './collections.repository';

/**
 * CollectionsModule encapsulates all REST endpoints and business logic for
 * KMS collections — named, user-owned groups of files.
 *
 * Provides:
 * - GET    /api/v1/collections             — list all collections
 * - POST   /api/v1/collections             — create a collection
 * - GET    /api/v1/collections/:id         — get a collection by ID
 * - PATCH  /api/v1/collections/:id         — update a collection
 * - DELETE /api/v1/collections/:id         — delete a collection
 * - POST   /api/v1/collections/:id/files   — add files to a collection
 * - DELETE /api/v1/collections/:id/files/:fileId — remove a file from a collection
 *
 * DatabaseModule is @Global so the explicit import is for readability and
 * testability. CollectionsRepository is provided here (not in DatabaseModule)
 * as it is specific to this domain.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [CollectionsController],
  providers: [CollectionsService, CollectionsRepository],
  exports: [CollectionsService],
})
export class CollectionsModule {}
