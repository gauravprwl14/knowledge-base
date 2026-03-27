import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Feature flag shape for the KMS system.
 *
 * Each flag maps to a `features.<flag>.enabled` key in `.kms/config.json`.
 * Individual flags can also be overridden at runtime via env vars of the form
 * `KMS_FEATURE_<UPPER_SNAKE>` (e.g. `KMS_FEATURE_GOOGLE_DRIVE=true`).
 */
export interface FeatureFlags {
  googleDrive: boolean;
  embedding: boolean;
  semanticSearch: boolean;
  hybridSearch: boolean;
  rag: boolean;
  graph: boolean;
  voiceTranscription: boolean;
  googleOAuthLogin: boolean;
  deduplication: boolean;
  objectStorage: boolean;
}

/**
 * FeatureFlagsService — reads feature flags from `.kms/config.json` on startup,
 * merges optional local overrides from `.kms/config.local.json`, then applies
 * any `KMS_FEATURE_*` env-var overrides.
 *
 * Because the module is `@Global()`, every other NestJS module can inject this
 * service without importing `FeatureFlagsModule` explicitly.
 *
 * @example
 * ```typescript
 * constructor(private readonly featureFlags: FeatureFlagsService) {}
 *
 * doSomething() {
 *   if (!this.featureFlags.isEnabled('googleDrive')) {
 *     throw new ServiceUnavailableException('Google Drive is disabled');
 *   }
 * }
 * ```
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private flags: FeatureFlags;

  constructor(
    @InjectPinoLogger(FeatureFlagsService.name)
    private readonly logger: PinoLogger,
  ) {}

  /** Loads and logs feature flags on module initialisation. */
  onModuleInit() {
    this.flags = this.loadFlags();
    this.logger.info({ flags: this.flags }, 'Feature flags loaded');
  }

  /**
   * Resolves the full set of feature flags by merging:
   * 1. `.kms/config.json` (project root, git-tracked baseline)
   * 2. `.kms/config.local.json` (gitignored, local overrides)
   * 3. `KMS_FEATURE_*` environment variables (highest priority)
   */
  private loadFlags(): FeatureFlags {
    const configPaths = [
      path.resolve(process.cwd(), '../.kms/config.json'),
      path.resolve(process.cwd(), '../../.kms/config.json'),
      path.resolve(process.cwd(), '.kms/config.json'),
    ];

    let config: any = {};
    for (const p of configPaths) {
      if (fs.existsSync(p)) {
        try {
          config = JSON.parse(fs.readFileSync(p, 'utf-8'));
          break;
        } catch { /* ignore parse errors */ }
      }
    }

    const localConfigPaths = configPaths.map(p => p.replace('config.json', 'config.local.json'));
    for (const p of localConfigPaths) {
      if (fs.existsSync(p)) {
        try {
          const local = JSON.parse(fs.readFileSync(p, 'utf-8'));
          config = { ...config, features: { ...config.features, ...local.features } };
          break;
        } catch { /* ignore parse errors */ }
      }
    }

    const f = config.features ?? {};

    return {
      googleDrive: this.resolveFlag('GOOGLE_DRIVE', f.googleDrive?.enabled ?? false),
      embedding: this.resolveFlag('EMBEDDING', f.embedding?.enabled ?? false),
      semanticSearch: this.resolveFlag('SEMANTIC_SEARCH', f.semanticSearch?.enabled ?? false),
      hybridSearch: this.resolveFlag('HYBRID_SEARCH', f.hybridSearch?.enabled ?? false),
      rag: this.resolveFlag('RAG', f.rag?.enabled ?? false),
      graph: this.resolveFlag('GRAPH', f.graph?.enabled ?? false),
      voiceTranscription: this.resolveFlag('VOICE_TRANSCRIPTION', f.voiceTranscription?.enabled ?? true),
      googleOAuthLogin: this.resolveFlag('GOOGLE_OAUTH_LOGIN', f.googleOAuthLogin?.enabled ?? false),
      deduplication: this.resolveFlag('DEDUPLICATION', f.deduplication?.enabled ?? true),
      objectStorage: this.resolveFlag('OBJECT_STORAGE', f.objectStorage?.enabled ?? false),
    };
  }

  /**
   * Resolves a single flag value.
   *
   * Env var `KMS_FEATURE_<envKey>` takes precedence over the config-file value.
   * @param envKey - Upper-snake suffix, e.g. `GOOGLE_DRIVE`
   * @param configDefault - Value read from the config file (or hardcoded fallback)
   */
  private resolveFlag(envKey: string, configDefault: boolean): boolean {
    const envVal = process.env[`KMS_FEATURE_${envKey}`];
    if (envVal === 'true') return true;
    if (envVal === 'false') return false;
    return configDefault;
  }

  /**
   * Returns `true` if the given feature flag is enabled.
   * @param flag - Key of {@link FeatureFlags}
   */
  isEnabled(flag: keyof FeatureFlags): boolean {
    return this.flags[flag] ?? false;
  }

  /**
   * Returns a shallow copy of all feature flag values.
   * Intended for internal use (e.g. logging, admin endpoints).
   */
  getAll(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * Returns a subset of flags that are safe to expose to the UI.
   * Infra-only flags (embedding, hybridSearch, graph, deduplication,
   * objectStorage) are omitted to avoid leaking implementation details.
   */
  getPublicFlags(): Partial<FeatureFlags> {
    return {
      googleDrive: this.flags.googleDrive,
      googleOAuthLogin: this.flags.googleOAuthLogin,
      voiceTranscription: this.flags.voiceTranscription,
      semanticSearch: this.flags.semanticSearch,
      rag: this.flags.rag,
    };
  }
}
