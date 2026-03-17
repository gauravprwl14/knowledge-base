import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAG_KEY } from '../decorators/require-feature.decorator';
import { FeatureFlagsService, FeatureFlags } from '../feature-flags.service';

/**
 * Guard that enforces feature-flag gating on routes decorated with
 * {@link RequireFeature}.
 *
 * When no `@RequireFeature` metadata is present the guard passes through
 * transparently. When metadata is found and the flag is disabled a
 * `503 Service Unavailable` response is returned.
 *
 * @example
 * ```typescript
 * // Apply per-handler
 * @RequireFeature('googleDrive')
 * @UseGuards(FeatureFlagGuard)
 * @Get('google-drive/oauth')
 * async initiateOAuth() { ... }
 * ```
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  /**
   * Resolves the required feature flag from metadata and checks whether it is
   * enabled.
   *
   * @param context - NestJS execution context
   * @returns `true` if no flag is required or the flag is enabled
   * @throws {ServiceUnavailableException} when the required flag is disabled
   */
  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<keyof FeatureFlags>(
      FEATURE_FLAG_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!flag) return true;

    if (this.featureFlagsService.isEnabled(flag)) return true;

    throw new ServiceUnavailableException(`Feature '${flag}' is currently disabled`);
  }
}
