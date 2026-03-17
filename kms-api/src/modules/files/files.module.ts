import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

/**
 * FilesModule encapsulates all REST endpoints and business logic for KMS file
 * management.
 *
 * Imports DatabaseModule for PrismaService access. DatabaseModule is @Global
 * so this import is optional in practice, but included explicitly for
 * readability and testability.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
