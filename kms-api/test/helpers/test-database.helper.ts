import { PrismaClient } from '@prisma/client';

/**
 * Test Database Helper
 *
 * Provides utilities for managing test database state.
 */
export class TestDatabaseHelper {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Connects to the test database
   */
  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  /**
   * Disconnects from the test database
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Cleans all data from the database
   */
  async cleanDatabase(): Promise<void> {
    const tablenames = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations')
      .map((name) => `"public"."${name}"`)
      .join(', ');

    if (tables.length > 0) {
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    }
  }

  /**
   * Seeds the database with test data
   */
  async seed(): Promise<void> {
    // Add seed logic here if needed
  }

  /**
   * Gets the Prisma client
   */
  getClient(): PrismaClient {
    return this.prisma;
  }
}
