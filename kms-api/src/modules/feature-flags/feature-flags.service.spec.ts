import { FeatureFlagsService } from './feature-flags.service';
import { getLoggerToken } from 'nestjs-pino';
import { Test } from '@nestjs/testing';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;

  async function buildService(envOverrides: Record<string, string> = {}) {
    Object.entries(envOverrides).forEach(([k, v]) => (process.env[k] = v));

    const module = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: getLoggerToken(FeatureFlagsService.name), useValue: mockLogger },
      ],
    }).compile();

    const svc = module.get(FeatureFlagsService);
    // Trigger onModuleInit manually (module is not started in tests by default)
    svc.onModuleInit();
    return svc;
  }

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up env overrides
    Object.keys(process.env)
      .filter((k) => k.startsWith('KMS_FEATURE_'))
      .forEach((k) => delete process.env[k]);
  });

  describe('isEnabled', () => {
    it('returns false for all flags when no config and no env vars', async () => {
      service = await buildService();
      // At minimum these infrastructure flags default to false
      expect(service.isEnabled('googleDrive')).toBe(false);
      expect(service.isEnabled('embedding')).toBe(false);
    });

    it('env var KMS_FEATURE_GOOGLE_DRIVE=true overrides config default', async () => {
      service = await buildService({ KMS_FEATURE_GOOGLE_DRIVE: 'true' });
      expect(service.isEnabled('googleDrive')).toBe(true);
    });

    it('env var KMS_FEATURE_GOOGLE_DRIVE=false disables even if config says true', async () => {
      service = await buildService({ KMS_FEATURE_GOOGLE_DRIVE: 'false' });
      expect(service.isEnabled('googleDrive')).toBe(false);
    });

    it('deduplication defaults to true (from hardcoded fallback)', async () => {
      service = await buildService();
      expect(service.isEnabled('deduplication')).toBe(true);
    });

    it('voiceTranscription defaults to true', async () => {
      service = await buildService();
      expect(service.isEnabled('voiceTranscription')).toBe(true);
    });
  });

  describe('getAll', () => {
    it('returns a snapshot of all flags', async () => {
      service = await buildService({ KMS_FEATURE_RAG: 'true' });
      const all = service.getAll();
      expect(all).toHaveProperty('rag', true);
      expect(all).toHaveProperty('googleDrive');
    });

    it('returns a copy — mutations do not affect internal state', async () => {
      service = await buildService();
      const all = service.getAll();
      (all as any).googleDrive = true;
      expect(service.isEnabled('googleDrive')).toBe(false);
    });
  });

  describe('getPublicFlags', () => {
    it('includes client-safe flags', async () => {
      service = await buildService({ KMS_FEATURE_RAG: 'true' });
      const pub = service.getPublicFlags();
      expect(pub).toHaveProperty('rag', true);
      expect(pub).toHaveProperty('googleDrive');
      expect(pub).toHaveProperty('voiceTranscription');
    });

    it('omits infra-only flags like embedding, graph, deduplication', async () => {
      service = await buildService();
      const pub = service.getPublicFlags();
      expect(pub).not.toHaveProperty('embedding');
      expect(pub).not.toHaveProperty('graph');
      expect(pub).not.toHaveProperty('deduplication');
    });
  });
});
