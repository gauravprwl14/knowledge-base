import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FeatureFlagsService } from './feature-flags.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * FeatureFlagsController — exposes a public endpoint for the UI to discover
 * which features are currently enabled.
 *
 * Only a safe subset of flags is returned (see
 * {@link FeatureFlagsService.getPublicFlags}). Infra-level flags such as
 * `embedding` and `graph` are intentionally omitted.
 *
 * Routes:
 * - GET /features   Returns public feature flag states (no auth required)
 */
@ApiTags('Features')
@Controller('features')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /**
   * Returns the subset of feature flags visible to the frontend.
   *
   * Marked `@Public()` so the browser/Next.js SSR layer can call it without a
   * JWT — the flags need to be available before the user logs in (e.g. to show
   * or hide the "Sign in with Google" button).
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Get enabled feature flags (public subset)' })
  @ApiResponse({ status: 200, description: 'Feature flag states visible to the UI' })
  getFeatures() {
    return this.featureFlagsService.getPublicFlags();
  }
}
