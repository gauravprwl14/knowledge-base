import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Public decorator to mark routes as publicly accessible
 * (bypasses authentication)
 *
 * @example
 * ```typescript
 * @Public()
 * @Get('status')
 * getStatus() {
 *   return { status: 'ok' };
 * }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
