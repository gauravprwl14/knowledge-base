import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule — global module that provides {@link PrismaService} to the
 * entire search-api application.
 *
 * Marked `\@Global()` so that feature modules do not need to import it
 * individually.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
