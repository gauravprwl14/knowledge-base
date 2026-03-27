import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKey } from '@prisma/client';

/**
 * Current API Key decorator for extracting the authenticated API key from request
 *
 * @example
 * ```typescript
 * @Get('usage')
 * getUsage(@CurrentApiKey() apiKey: ApiKey) {
 *   return { usageCount: apiKey.usageCount };
 * }
 * ```
 */
export const CurrentApiKey = createParamDecorator(
  (data: keyof ApiKey | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const apiKey = request.apiKey;

    if (!apiKey) {
      return undefined;
    }

    return data ? apiKey[data] : apiKey;
  },
);
