import { Test, TestingModule } from '@nestjs/testing';
import { ContentConfigService } from './content-config.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { UpdateContentConfigDto } from './dto/update-content-config.dto';

// ---------------------------------------------------------------------------
// Helpers — factory functions for mock data
// ---------------------------------------------------------------------------

/**
 * Creates a mock ContentConfiguration record with sensible defaults.
 */
function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-001',
    userId: 'user-001',
    platformConfig: {
      linkedin: { enabled: true, formats: ['post'], variations: 1, autoGenerate: false },
    },
    voiceMode: 'auto',
    hashnodeApiKeyEncrypted: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

/**
 * Creates a mock CreatorVoiceProfile record.
 */
function makeVoiceProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vp-001',
    userId: 'user-001',
    profileText:
      'I write conversational, accessible posts about software engineering. ' +
      'My audience is mid-level developers who want practical, actionable advice. ' +
      'I use analogies and real-world examples to make complex topics digestible.',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

describe('ContentConfigService', () => {
  let service: ContentConfigService;
  // Holds the compiled TestingModule — created once in beforeAll and closed in afterAll.
  let module: TestingModule;

  // --- PrismaService mocks ---
  const prismaContentConfigUpsert = jest.fn();
  const prismaContentConfigFindUnique = jest.fn();
  const prismaVoiceProfileFindUnique = jest.fn();
  const prismaVoiceProfileUpsert = jest.fn();

  const mockPrisma = {
    contentConfiguration: {
      upsert: prismaContentConfigUpsert,
      findUnique: prismaContentConfigFindUnique,
    },
    creatorVoiceProfile: {
      findUnique: prismaVoiceProfileFindUnique,
      upsert: prismaVoiceProfileUpsert,
    },
  };

  // --- Logger mock ---
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  // Create the NestJS TestingModule ONCE per describe block to avoid creating
  // a new module (and associated async resources) for every test.
  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ContentConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: `PinoLogger:${ContentConfigService.name}`,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ContentConfigService>(ContentConfigService);
  });

  // Release module resources after all tests complete.
  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    // Clear mock call counts and per-test return values between tests.
    // Default mock behaviours are set here (not in beforeAll) so they reset
    // correctly after jest.clearAllMocks() wipes them.
    jest.clearAllMocks();

    // Default mock behaviours (overridden per test where needed)
    prismaContentConfigUpsert.mockResolvedValue(makeConfig());
    prismaContentConfigFindUnique.mockResolvedValue(makeConfig());
    prismaVoiceProfileFindUnique.mockResolvedValue(makeVoiceProfile());
    prismaVoiceProfileUpsert.mockResolvedValue(makeVoiceProfile());
  });

  // -------------------------------------------------------------------------
  // getConfig()
  // -------------------------------------------------------------------------

  describe('getConfig()', () => {
    it('returns existing config for user', async () => {
      const config = makeConfig({ voiceMode: 'interactive' });
      prismaContentConfigUpsert.mockResolvedValue(config);

      const result = await service.getConfig('user-001');

      expect(result).toEqual(config);
      expect(result.voiceMode).toBe('interactive');
    });

    it('returns defaults when no config exists (upsert-on-read)', async () => {
      // When upsert is called with an empty update and a full create, Prisma
      // creates the row with defaults. We verify the upsert is called with
      // the correct default platformConfig and voiceMode.
      const defaultConfig = makeConfig({
        platformConfig: {
          linkedin: { enabled: true, formats: ['post'], variations: 1, autoGenerate: false },
        },
        voiceMode: 'auto',
      });
      prismaContentConfigUpsert.mockResolvedValue(defaultConfig);

      const result = await service.getConfig('user-001');

      // Verify upsert was called (not findUnique — this is the upsert-on-read pattern)
      expect(prismaContentConfigUpsert).toHaveBeenCalledTimes(1);
      const callArgs = prismaContentConfigUpsert.mock.calls[0][0];
      expect(callArgs.where).toEqual({ userId: 'user-001' });
      // The create block should include default values
      expect(callArgs.create.voiceMode).toBe('auto');
      expect(callArgs.create.platformConfig).toBeDefined();
      // The update block should be empty (no-op)
      expect(callArgs.update).toEqual({});
      expect(result).toEqual(defaultConfig);
    });
  });

  // -------------------------------------------------------------------------
  // updateConfig()
  // -------------------------------------------------------------------------

  describe('updateConfig()', () => {
    it('upserts config with new platform settings', async () => {
      const dto: UpdateContentConfigDto = {
        platformConfig: {
          linkedin: { enabled: true, formats: ['post'], variations: 2, autoGenerate: true },
          blog: { enabled: false },
        },
        voiceMode: 'interactive',
      };
      const updatedConfig = makeConfig({
        platformConfig: dto.platformConfig,
        voiceMode: 'interactive',
      });
      prismaContentConfigUpsert.mockResolvedValue(updatedConfig);

      const result = await service.updateConfig('user-001', dto);

      expect(prismaContentConfigUpsert).toHaveBeenCalledTimes(1);
      expect(result.voiceMode).toBe('interactive');
    });

    it('throws KBCNT0006 when platformConfig has invalid structure (missing enabled)', async () => {
      const dto: UpdateContentConfigDto = {
        // `enabled` is required but missing here — TypeScript allows it via cast
        platformConfig: {
          linkedin: { enabled: 'yes' as unknown as boolean },
        },
      };

      await expect(service.updateConfig('user-001', dto)).rejects.toMatchObject({
        code: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.code,
      });

      // DB should not have been touched
      expect(prismaContentConfigUpsert).not.toHaveBeenCalled();
    });

    it('throws KBCNT0006 when platformConfig has invalid formats (non-array)', async () => {
      const dto: UpdateContentConfigDto = {
        platformConfig: {
          linkedin: { enabled: true, formats: 'post' as unknown as string[] },
        },
      };

      await expect(service.updateConfig('user-001', dto)).rejects.toMatchObject({
        code: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.code,
      });
    });

    it('throws KBCNT0006 when variations is out of range', async () => {
      const dto: UpdateContentConfigDto = {
        platformConfig: {
          linkedin: { enabled: true, variations: 10 }, // max is 5
        },
      };

      await expect(service.updateConfig('user-001', dto)).rejects.toMatchObject({
        code: ERROR_CODES.CNT.INVALID_PLATFORM_CONFIG.code,
      });
    });

    it('encrypts hashnodeApiKey before storing (stored value != raw key)', async () => {
      const rawKey = 'my-secret-hashnode-api-key-12345';
      const dto: UpdateContentConfigDto = { hashnodeApiKey: rawKey };

      const capturedUpdateData: Record<string, unknown>[] = [];
      prismaContentConfigUpsert.mockImplementation(({ update, create }) => {
        capturedUpdateData.push(update, create);
        return makeConfig();
      });

      await service.updateConfig('user-001', dto);

      // The stored value should NOT be the raw key — it must be encrypted
      const allStoredValues = capturedUpdateData.flatMap((d) =>
        Object.values(d).filter((v) => typeof v === 'string'),
      );
      expect(allStoredValues).not.toContain(rawKey);

      // The encrypted value should be present and be a non-empty base64-ish string
      const encryptedValues = capturedUpdateData.flatMap((d) => {
        const v = (d as Record<string, unknown>).hashnodeApiKeyEncrypted;
        return v !== undefined ? [v] : [];
      });
      expect(encryptedValues.length).toBeGreaterThan(0);
      expect(typeof encryptedValues[0]).toBe('string');
      expect((encryptedValues[0] as string).length).toBeGreaterThan(rawKey.length);
    });
  });

  // -------------------------------------------------------------------------
  // getVoiceProfile()
  // -------------------------------------------------------------------------

  describe('getVoiceProfile()', () => {
    it('returns profile when it exists', async () => {
      const profile = makeVoiceProfile();
      prismaVoiceProfileFindUnique.mockResolvedValue(profile);

      const result = await service.getVoiceProfile('user-001');

      expect(result).toEqual(profile);
      expect(prismaVoiceProfileFindUnique).toHaveBeenCalledWith({
        where: { userId: 'user-001' },
      });
    });

    it('returns null when no profile is set', async () => {
      prismaVoiceProfileFindUnique.mockResolvedValue(null);

      const result = await service.getVoiceProfile('user-001');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // upsertVoiceProfile()
  // -------------------------------------------------------------------------

  describe('upsertVoiceProfile()', () => {
    /** A string of exactly 100 characters (minimum valid length). */
    const EXACTLY_100_CHARS = 'A'.repeat(100);

    /** A string of 101 characters (just above the minimum). */
    const JUST_OVER_100_CHARS = 'A'.repeat(101);

    /** A string of 99 characters (just below the minimum — should fail). */
    const JUST_UNDER_100_CHARS = 'A'.repeat(99);

    it('creates profile when none exists', async () => {
      const profile = makeVoiceProfile({ profileText: EXACTLY_100_CHARS });
      prismaVoiceProfileUpsert.mockResolvedValue(profile);

      const result = await service.upsertVoiceProfile('user-001', EXACTLY_100_CHARS);

      expect(prismaVoiceProfileUpsert).toHaveBeenCalledTimes(1);
      expect(result).toEqual(profile);
    });

    it('updates profile when one exists', async () => {
      const newText = JUST_OVER_100_CHARS;
      const updatedProfile = makeVoiceProfile({ profileText: newText });
      prismaVoiceProfileUpsert.mockResolvedValue(updatedProfile);

      const result = await service.upsertVoiceProfile('user-001', newText);

      expect(prismaVoiceProfileUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-001' },
          update: { profileText: newText },
          create: { userId: 'user-001', profileText: newText },
        }),
      );
      expect(result.profileText).toBe(newText);
    });

    it('throws KBCNT0007 when profileText < 100 characters', async () => {
      await expect(
        service.upsertVoiceProfile('user-001', JUST_UNDER_100_CHARS),
      ).rejects.toMatchObject({
        code: ERROR_CODES.CNT.VOICE_PROFILE_NOT_SET.code,
      });

      // DB should not have been called
      expect(prismaVoiceProfileUpsert).not.toHaveBeenCalled();
    });

    it('succeeds when profileText = exactly 100 characters', async () => {
      const profile = makeVoiceProfile({ profileText: EXACTLY_100_CHARS });
      prismaVoiceProfileUpsert.mockResolvedValue(profile);

      // Should not throw — 100 is the minimum valid length
      const result = await service.upsertVoiceProfile('user-001', EXACTLY_100_CHARS);
      expect(result).toBeDefined();
    });

    it('succeeds when profileText > 100 characters', async () => {
      const longText =
        'I write technical blog posts aimed at experienced developers who want to stay current ' +
        'with modern backend practices. My tone is direct and opinionated, backed by real-world examples. ' +
        'I avoid jargon and prefer plain language with code examples.';
      const profile = makeVoiceProfile({ profileText: longText });
      prismaVoiceProfileUpsert.mockResolvedValue(profile);

      const result = await service.upsertVoiceProfile('user-001', longText);
      expect(result.profileText).toBe(longText);
    });
  });
});
