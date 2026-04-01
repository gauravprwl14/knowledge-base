import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppError } from '../../../errors/types/app-error';
import { ERROR_CODES } from '../../../errors/error-codes';
import { PrismaService } from '../../../database/prisma/prisma.service';

/**
 * ContentJobOwnerGuard — route-level guard that verifies the authenticated
 * user owns the content job referenced by the `:id` URL parameter.
 *
 * Place this guard on any controller method that reads or mutates a specific
 * content job to prevent IDOR (Insecure Direct Object Reference) attacks.
 *
 * Usage:
 * ```typescript
 * @UseGuards(JwtAuthGuard, ContentJobOwnerGuard)
 * @Get(':id')
 * getJob(@Param('id') id: string) { ... }
 * ```
 *
 * Behaviour:
 *   - Extracts `:id` from the route parameters (NOT query string — the guard
 *     is intentionally param-only to avoid accidental bypass via QS injection).
 *   - Looks up the `ContentJob` by id via `PrismaService`.
 *   - Throws `NotFoundException` (KBCNT0001) if the job does not exist.
 *   - Throws `ForbiddenException` if `job.userId !== request.user.id`.
 *   - Returns `true` (allow) when both checks pass.
 *
 * Note: `JwtAuthGuard` (or equivalent) must run before this guard to ensure
 * `request.user` is populated.
 */
@Injectable()
export class ContentJobOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks that the requesting user owns the content job at `:id`.
   *
   * @param context - NestJS execution context providing access to the request.
   * @returns `true` when the user owns the job.
   * @throws {NotFoundException}   (404) when the job does not exist (KBCNT0001).
   * @throws {ForbiddenException}  (403) when the requesting user does not own the job.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Switch to HTTP context — this guard is designed for REST controllers only
    const request = context.switchToHttp().getRequest<{
      params: Record<string, string>;
      user?: { id: string };
    }>();

    // Extract the job UUID from route params (e.g. GET /content/jobs/:id)
    // We only look at params, not query string, to prevent bypass via ?id=...
    const jobId = request.params?.id;

    if (!jobId) {
      // Guard misconfigured — route does not have an :id param
      throw new ForbiddenException('Missing resource identifier in route params');
    }

    const userId = request.user?.id;
    if (!userId) {
      // JwtAuthGuard should run first; if request.user is absent, treat as forbidden
      throw new ForbiddenException('Not authenticated');
    }

    // Look up the job — any user can trigger this guard so we do NOT scope to userId yet
    const job = await this.prisma.contentJob.findUnique({
      where: { id: jobId },
      select: { id: true, userId: true },
    });

    if (!job) {
      // Surface as AppError so the global error filter can format the response correctly
      throw new AppError({ code: ERROR_CODES.CNT.JOB_NOT_FOUND.code });
    }

    if (job.userId !== userId) {
      throw new ForbiddenException('You do not have access to this content job');
    }

    // All checks passed — allow the request to proceed
    return true;
  }
}
