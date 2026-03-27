import { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AppError } from '../../errors/types/app-error';
import { PinoLogger } from 'nestjs-pino';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function makeMockLogger(): PinoLogger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    const logger = makeMockLogger();
    guard = new AdminGuard(logger);
  });

  it('passes for a user with role=ADMIN', () => {
    const ctx = makeContext({ id: 'user-1', role: 'ADMIN' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws 403 + KBAUT0010 for a user with role=USER', () => {
    const ctx = makeContext({ id: 'user-2', role: 'USER' });
    expect(() => guard.canActivate(ctx)).toThrow(AppError);

    try {
      guard.canActivate(ctx);
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(403);
      expect(appErr.code).toBe('KBAUT0010');
    }
  });

  it('throws 403 for SERVICE_ACCOUNT role', () => {
    const ctx = makeContext({ id: 'user-3', role: 'SERVICE_ACCOUNT' });
    expect(() => guard.canActivate(ctx)).toThrow(AppError);

    try {
      guard.canActivate(ctx);
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(403);
      expect(appErr.code).toBe('KBAUT0010');
    }
  });

  it('throws 401 for an unauthenticated request (no user on req)', () => {
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(AppError);

    try {
      guard.canActivate(ctx);
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(401);
    }
  });

  it('throws 401 when request.user is undefined', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(AppError);
  });
});
