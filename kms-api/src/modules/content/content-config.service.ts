import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as crypto from 'crypto';
import { ContentConfiguration, CreatorVoiceProfile } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { UpdateContentConfigDto, PlatformConfigEntry } from './dto/update-content-config.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default platform configuration applied when a user has no saved configuration.
 * All platforms are enabled with one variation each and `autoGenerate: false`.
 */
const DEFAULT_PLATFORM_CONFIG: Record<string, PlatformConfigEntry> = {
  linkedin: { enabled: true, formats: ['post'], variations: 1, autoGenerate: false },
  blog: { enabled: true, formats: ['long-form'], variations: 1, autoGenerate: false },
  instagram: { enabled: true, formats: ['carousel'], variations: 1, autoGenerate: false },
  twitter: { enabled: true, formats: ['thread'], variations: 1, autoGenerate: false },
  newsletter: { enabled: true, formats: ['newsletter'], variations: 1, autoGenerate: false },
};

/** Default voice mode when no config exists. */
const DEFAULT_VOICE_MODE = 'auto';

/**
 * Minimum length (in characters) for a valid creator voice profile text.
 * Enforced to ensure profiles contain enough detail to be useful to Claude.
 */
const MIN_VOICE_PROFILE_LENGTH = 100;

// ---------------------------------------------------------------------------
// ContentConfigService
// ---------------------------------------------------------------------------

/**
 * ContentConfigService — manages per-user content creator configuration
 * and creator voice profiles.
 *
 * Responsibilities:
 *  - `getConfig`          — upsert-on-read: return existing config or create defaults
 *  - `updateConfig`       — validate and persist platform config changes; encrypt API keys
 *  - `getVoiceProfile`    — return the user's voice profile or null if not set
 *  - `upsertVoiceProfile` — create-or-update voice profile with length validation
 *
 * Security:
 *  - The Hashnode API key is AES-256-GCM encrypted before storage using the
 *    `API_KEY_ENCRYPTION_SECRET` environment variable (same key used by
 *    TokenEncryptionService). The raw key is never logged or returned to clients.
 */
@Injectable()
export class ContentConfigService {
  /**
   * AES-256 encryption key derived from `API_KEY_ENCRYPTION_SECRET` via scrypt.
   * Derived once at construction time to avoid repeated blocking scrypt calls.
   */
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ContentConfigService.name)
    private readonly logger: PinoLogger,
  ) {
    // Derive a stable 256-bit key from the environment secret.
    // The salt 'kms-salt' matches TokenEncryptionService for consistency.
    const secret =
      process.env.API_KEY_ENCRYPTION_SECRET || 'dev-secret-32-bytes-exactly!!!!!!';
    this.encryptionKey = crypto.scryptSync(secret, 'kms-salt', 32);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   *
   * Output format (base64): `[12-byte IV] + [16-byte auth tag] + [ciphertext]`
   *
   * Replicates the same algorithm as `TokenEncryptionService` so that both
   * services use the same key derivation and format.
   *
   * @param plaintext - The UTF-8 string to encrypt.
   * @returns Base64-encoded ciphertext with prepended IV and auth tag.
   */
  private encryptApiKey(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * Validates that a `platformConfig` map has well-formed entries.
   *
   * Each entry must have a boolean `enabled` field. Optional fields
   * (`formats`, `variations`, `autoGenerate`) are type-checked if present.
   *
   * @param platformConfig - The raw config object from the DTO.
   * @throws {AppError} KBCNT0006 if any entry is structurally invalid.
   */
  private validatePlatformConfig(
    platformConfig: Record<string, PlatformConfigEntry>,
  ): void {
    for (const [platform, entry] of Object.entries(platformConfig)) {
      // `enabled` is mandatory and must be a boolean
      if (typeof entry.enabled !== 'boolean') {
        throw new AppError({
          code: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.code,
          message: `Platform '${platform}': 'enabled' must be a boolean`,
          statusCode: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.httpStatus,
        });
      }

      // `formats` must be an array of strings if present
      if (entry.formats !== undefined) {
        if (
          !Array.isArray(entry.formats) ||
          entry.formats.some((f) => typeof f !== 'string')
        ) {
          throw new AppError({
            code: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.code,
            message: `Platform '${platform}': 'formats' must be an array of strings`,
            statusCode: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.httpStatus,
          });
        }
      }

      // `variations` must be a positive integer between 1 and 5 if present
      if (entry.variations !== undefined) {
        if (
          typeof entry.variations !== 'number' ||
          !Number.isInteger(entry.variations) ||
          entry.variations < 1 ||
          entry.variations > 5
        ) {
          throw new AppError({
            code: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.code,
            message: `Platform '${platform}': 'variations' must be an integer between 1 and 5`,
            statusCode: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.httpStatus,
          });
        }
      }

      // `autoGenerate` must be a boolean if present
      if (
        entry.autoGenerate !== undefined &&
        typeof entry.autoGenerate !== 'boolean'
      ) {
        throw new AppError({
          code: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.code,
          message: `Platform '${platform}': 'autoGenerate' must be a boolean`,
          statusCode: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.httpStatus,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  /**
   * Get the user's content configuration.
   *
   * Implements an upsert-on-read pattern: if the user has never saved a
   * configuration, we create a row with sensible defaults and return it.
   * This ensures the caller always receives a fully-formed `ContentConfiguration`
   * without having to handle the null case.
   *
   * @param userId - UUID of the authenticated user.
   * @returns The user's ContentConfiguration (created with defaults if absent).
   */
  @Trace({ name: 'content-config.getConfig' })
  async getConfig(userId: string): Promise<ContentConfiguration> {
    this.logger.info({ userId }, 'content-config: getConfig');

    // upsert-on-read: create with defaults if not present, return existing if found.
    // Prisma's Json type requires `as unknown as Prisma.InputJsonValue` to pass
    // a typed Record — the runtime value is identical, the cast is type-only.
    const config = await this.prisma.contentConfiguration.upsert({
      where: { userId },
      update: {}, // no-op update — we only want to create when missing
      create: {
        userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        platformConfig: DEFAULT_PLATFORM_CONFIG as unknown as any,
        voiceMode: DEFAULT_VOICE_MODE,
      },
    });

    return config;
  }

  /**
   * Update the user's content configuration.
   *
   * Uses `upsert` so the operation is safe to call before `getConfig`.
   * Fields not present in the DTO are left unchanged via the Prisma
   * `update` block only touching provided fields.
   *
   * @param userId - UUID of the authenticated user.
   * @param dto    - Partial update payload.
   * @returns The updated ContentConfiguration record.
   * @throws {AppError} KBCNT0006 when `platformConfig` contains invalid entries.
   */
  @Trace({ name: 'content-config.updateConfig' })
  async updateConfig(
    userId: string,
    dto: UpdateContentConfigDto,
  ): Promise<ContentConfiguration> {
    this.logger.info({ userId }, 'content-config: updateConfig');

    // Validate platform config structure before touching the DB
    if (dto.platformConfig) {
      this.validatePlatformConfig(dto.platformConfig);
    }

    // Encrypt the Hashnode API key if provided — never store the raw key
    let hashnodeApiKeyEncrypted: string | undefined;
    if (dto.hashnodeApiKey !== undefined) {
      hashnodeApiKeyEncrypted = this.encryptApiKey(dto.hashnodeApiKey);
      this.logger.info({ userId }, 'content-config: hashnodeApiKey encrypted for storage');
    }

    // Build the update payload — only include fields that were explicitly provided
    const updateData: Record<string, unknown> = {};
    if (dto.platformConfig !== undefined) updateData.platformConfig = dto.platformConfig;
    if (dto.voiceMode !== undefined) updateData.voiceMode = dto.voiceMode;
    if (hashnodeApiKeyEncrypted !== undefined) {
      updateData.hashnodeApiKeyEncrypted = hashnodeApiKeyEncrypted;
    }

    const config = await this.prisma.contentConfiguration.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        platformConfig: (dto.platformConfig ?? DEFAULT_PLATFORM_CONFIG) as unknown as any,
        voiceMode: dto.voiceMode ?? DEFAULT_VOICE_MODE,
        hashnodeApiKeyEncrypted: hashnodeApiKeyEncrypted ?? null,
      },
    });

    return config;
  }

  /**
   * Get the user's creator voice profile.
   *
   * Returns null if the user has not yet created a profile, allowing
   * the controller to decide whether to return 404 or an empty response.
   *
   * @param userId - UUID of the authenticated user.
   * @returns The CreatorVoiceProfile record, or null if not set.
   */
  @Trace({ name: 'content-config.getVoiceProfile' })
  async getVoiceProfile(userId: string): Promise<CreatorVoiceProfile | null> {
    this.logger.info({ userId }, 'content-config: getVoiceProfile');

    const profile = await this.prisma.creatorVoiceProfile.findUnique({
      where: { userId },
    });

    return profile;
  }

  /**
   * Upsert the user's creator voice profile.
   *
   * Creates a new profile if none exists, or replaces the existing one.
   * The profileText must be at least 100 characters to ensure it contains
   * enough style and tone information to be useful as a writing guide.
   *
   * @param userId      - UUID of the authenticated user.
   * @param profileText - Free-form text describing writing style, tone, and audience.
   * @returns The created-or-updated CreatorVoiceProfile record.
   * @throws {AppError} KBCNT0007 when profileText is shorter than 100 characters.
   */
  @Trace({ name: 'content-config.upsertVoiceProfile' })
  async upsertVoiceProfile(
    userId: string,
    profileText: string,
  ): Promise<CreatorVoiceProfile> {
    this.logger.info(
      { userId, profileTextLength: profileText.length },
      'content-config: upsertVoiceProfile',
    );

    // Enforce minimum length — a very short profile is unlikely to be useful
    if (profileText.length < MIN_VOICE_PROFILE_LENGTH) {
      throw new AppError({
        code: ERROR_CODES.CNT.VOICE_PROFILE_NOT_SET.code,
        message: `Voice profile text must be at least ${MIN_VOICE_PROFILE_LENGTH} characters. ` +
          `Include details about your writing style, tone, target audience, and example phrases.`,
        statusCode: ERROR_CODES.CNT.VOICE_PROFILE_NOT_SET.httpStatus,
      });
    }

    const profile = await this.prisma.creatorVoiceProfile.upsert({
      where: { userId },
      update: { profileText },
      create: { userId, profileText },
    });

    return profile;
  }
}
