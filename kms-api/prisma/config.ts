import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma v7 configuration file.
 * datasource.url is required by the Prisma CLI for migrate commands.
 * migrate.adapter() provides the driver adapter for actual migration execution.
 * PrismaClient receives the adapter in its constructor (prisma.service.ts).
 */
export default defineConfig({
  schema: path.join(import.meta.dirname, 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      return new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    },
  },
});
