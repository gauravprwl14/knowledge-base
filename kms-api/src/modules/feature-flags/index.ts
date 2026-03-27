export { FeatureFlagsModule } from './feature-flags.module';
export { FeatureFlagsService, FeatureFlags } from './feature-flags.service';
export { FeatureFlagGuard } from './guards/feature-flag.guard';
export {
  RequireFeature,
  FEATURE_FLAG_KEY,
} from './decorators/require-feature.decorator';
