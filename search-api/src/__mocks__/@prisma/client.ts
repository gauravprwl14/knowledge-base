/**
 * Jest manual mock for @prisma/client.
 *
 * The generated Prisma client (Prisma v7) uses package.json `imports` maps
 * (#main-entry-point) which Jest 29 does not support natively. This mock
 * provides the minimal exports needed so tests can import from '@prisma/client'
 * without loading the actual generated client.
 *
 * Individual tests that need PrismaService should mock it at the provider
 * level via `{ provide: PrismaService, useValue: mockPrisma }`.
 */

export const PrismaClient = jest.fn().mockImplementation(() => ({
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  $on: jest.fn(),
}));

/**
 * Minimal tagged-template helper that mirrors Prisma.sql behaviour.
 * In tests we only need it to return something passable to $queryRaw mocks.
 */
function sql(strings: TemplateStringsArray, ...values: unknown[]): { sql: string; values: unknown[] } {
  return { sql: strings.join('?'), values };
}

/**
 * Minimal join helper — concatenates values for test purposes.
 */
function join(values: unknown[], separator = ', '): string {
  return values.join(separator);
}

export const Prisma = {
  // Tagged-template helpers used by BM25 raw queries
  sql,
  join,
  empty: sql``,

  PrismaClientKnownRequestError: class extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.code = code;
    }
  },
  PrismaClientUnknownRequestError: class extends Error {},
  PrismaClientInitializationError: class extends Error {},
  PrismaClientValidationError: class extends Error {},
};
