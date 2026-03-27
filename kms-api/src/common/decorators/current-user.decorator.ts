import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

/**
 * Current User decorator for extracting the authenticated user from request
 *
 * @example
 * ```typescript
 * @Get('me')
 * getMe(@CurrentUser() user: User) {
 *   return user;
 * }
 *
 * @Get('my-email')
 * getMyEmail(@CurrentUser('email') email: string) {
 *   return { email };
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
