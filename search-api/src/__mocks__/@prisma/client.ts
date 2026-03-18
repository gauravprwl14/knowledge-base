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

export const Prisma = {
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
