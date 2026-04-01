import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContentJobOwnerGuard } from './content-job-owner.guard';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AppError } from '../../../errors/types/app-error';
import { ERROR_CODES } from '../../../errors/error-codes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a mock NestJS ExecutionContext for HTTP requests.
 *
 * @param params      - Route params (e.g. `{ id: 'job-001' }`)
 * @param userId      - Authenticated user ID from `request.user`. Pass `null` to simulate
 *                      an unauthenticated request (request.user absent).
 *                      NOTE: Do NOT pass `undefined` — JS replaces `undefined` with the
 *                      default parameter value. Use `null` explicitly for "no user".
 */
function makeContext(
  params: Record<string, string> = {},
  userId: string | null = 'user-001',
): ExecutionContext {
  const request = {
    params,
    user: userId !== null ? { id: userId } : undefined,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

describe('ContentJobOwnerGuard', () => {
  let guard: ContentJobOwnerGuard;
  // Holds the compiled TestingModule — created once in beforeAll and closed in afterAll.
  let module: TestingModule;

  const prismaContentJobFindUnique = jest.fn();

  const mockPrisma = {
    contentJob: {
      findUnique: prismaContentJobFindUnique,
    },
  };

  // Create the NestJS TestingModule ONCE per describe block to avoid creating
  // a new module (and associated async resources) for every test.
  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ContentJobOwnerGuard,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    guard = module.get<ContentJobOwnerGuard>(ContentJobOwnerGuard);
  });

  // Release module resources after all tests complete.
  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    // resetAllMocks also clears mock implementations (return values) between tests.
    // clearAllMocks only clears call counts — implementations persist, causing test bleed.
    jest.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // canActivate()
  // -------------------------------------------------------------------------

  it('allows access when job.userId === request.user.id', async () => {
    prismaContentJobFindUnique.mockResolvedValue({ id: 'job-001', userId: 'user-001' });

    const ctx = makeContext({ id: 'job-001' }, 'user-001');
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('throws ForbiddenException when job.userId !== request.user.id', async () => {
    // Job belongs to user-999, request comes from user-001
    prismaContentJobFindUnique.mockResolvedValue({ id: 'job-001', userId: 'user-999' });

    const ctx = makeContext({ id: 'job-001' }, 'user-001');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws AppError KBCNT0001 (NotFoundException equivalent) when job does not exist', async () => {
    prismaContentJobFindUnique.mockResolvedValue(null);

    const ctx = makeContext({ id: 'nonexistent-job' }, 'user-001');

    // Guard throws AppError which is an HttpException (404) — not NotFoundException
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AppError);

    try {
      await guard.canActivate(ctx);
    } catch (err) {
      expect((err as AppError).code).toBe(ERROR_CODES.CNT.JOB_NOT_FOUND.code);
      expect((err as AppError).getStatus()).toBe(404);
    }
  });

  it('extracts jobId from :id route param, not from query string', async () => {
    prismaContentJobFindUnique.mockResolvedValue({ id: 'job-001', userId: 'user-001' });

    // Simulate a request where :id is in params (correct) — no query string
    const ctx = makeContext({ id: 'job-001' }, 'user-001');
    await guard.canActivate(ctx);

    // Confirm lookup used the params.id value
    expect(prismaContentJobFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-001' } }),
    );
  });

  it('throws ForbiddenException when :id param is missing from route', async () => {
    // Route does not have an :id param — misconfigured guard usage
    const ctx = makeContext({}, 'user-001'); // No 'id' in params

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when request.user is not populated (unauthenticated)', async () => {
    prismaContentJobFindUnique.mockResolvedValue({ id: 'job-001', userId: 'user-001' });

    const ctx = makeContext({ id: 'job-001' }, null); // No user — null means unauthenticated

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes the correct select shape to Prisma (only id and userId)', async () => {
    prismaContentJobFindUnique.mockResolvedValue({ id: 'job-001', userId: 'user-001' });

    const ctx = makeContext({ id: 'job-001' }, 'user-001');
    await guard.canActivate(ctx);

    // Confirm the query is minimal — only fetches id and userId
    expect(prismaContentJobFindUnique).toHaveBeenCalledWith({
      where: { id: 'job-001' },
      select: { id: true, userId: true },
    });
  });
});
