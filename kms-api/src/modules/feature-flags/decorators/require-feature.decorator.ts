import { SetMetadata } from '@nestjs/common';
import { FeatureFlags } from '../feature-flags.service';

/** Metadata key used by {@link FeatureFlagGuard} to read the required flag. */
export const FEATURE_FLAG_KEY = 'requiredFeature';

/**
 * Route decorator that requires a specific feature flag to be enabled.
 *
 * When applied to a handler (or controller class), {@link FeatureFlagGuard}
 * will check `FeatureFlagsService.isEnabled(flag)` and throw
 * `ServiceUnavailableException` if the flag is off.
 *
 * @param flag - Key of {@link FeatureFlags} to check
 *
 * @example
 * ```typescript
 * @RequireFeature('googleDrive')
 * @UseGuards(FeatureFlagGuard)
 * @Get('google-drive/oauth')
 * async initiateOAuth() { ... }
 * ```
 */
export const RequireFeature = (flag: keyof FeatureFlags) =>
  SetMetadata(FEATURE_FLAG_KEY, flag);
