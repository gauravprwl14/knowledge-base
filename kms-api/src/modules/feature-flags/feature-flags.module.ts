import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagGuard } from './guards/feature-flag.guard';

/**
 * FeatureFlagsModule — global NestJS module for runtime feature-flag gating.
 *
 * Marked `@Global()` so every other module can inject {@link FeatureFlagsService}
 * or {@link FeatureFlagGuard} without explicitly importing this module.
 *
 * Exports:
 * - {@link FeatureFlagsService} — check and retrieve flag values
 * - {@link FeatureFlagGuard}   — route guard for `@RequireFeature` decorator
 *
 * @example
 * ```typescript
 * // In any service, without importing FeatureFlagsModule:
 * constructor(private readonly featureFlags: FeatureFlagsService) {}
 * ```
 */
@Global()
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, FeatureFlagGuard],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
