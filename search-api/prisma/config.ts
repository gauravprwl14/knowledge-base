import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma v7 configuration for the search-api.
 *
 * The search-api shares the same PostgreSQL instance as kms-api but manages
 * its own Prisma client generation.  The datasource URL is read from the
 * DATABASE_URL environment variable, matching the kms-api convention.
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
