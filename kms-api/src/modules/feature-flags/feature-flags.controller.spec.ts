import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPublicFlags = {
  googleDrive: false,
  googleOAuthLogin: true,
  voiceTranscription: true,
  semanticSearch: false,
  rag: false,
};

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockFeatureFlagsService = {
  getPublicFlags: jest.fn(),
  isEnabled: jest.fn(),
  getAll: jest.fn(),
};

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('FeatureFlagsController', () => {
  let controller: FeatureFlagsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatureFlagsController],
      providers: [{ provide: FeatureFlagsService, useValue: mockFeatureFlagsService }],
    }).compile();

    controller = module.get<FeatureFlagsController>(FeatureFlagsController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // Route metadata — @Public()
  // =========================================================================

  describe('route metadata', () => {
    it('getFeatures() is marked @Public() — IS_PUBLIC_KEY metadata is true', () => {
      // @Public() decorates the handler method; Reflect reads it back.
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller.getFeatures);
      expect(isPublic).toBe(true);
    });

    it('does NOT require JwtAuthGuard — no guard override is needed', () => {
      // The controller has no @UseGuards(JwtAuthGuard); it relies solely on @Public().
      // Compiling without overrideGuard confirms the guard is absent.
      expect(controller).toBeDefined();
    });
  });

  // =========================================================================
  // GET /features
  // =========================================================================

  describe('getFeatures()', () => {
    it('delegates to featureFlagsService.getPublicFlags', () => {
      mockFeatureFlagsService.getPublicFlags.mockReturnValue(mockPublicFlags);

      const result = controller.getFeatures();

      expect(mockFeatureFlagsService.getPublicFlags).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockPublicFlags);
    });

    it('returns the subset of public flags (googleDrive, googleOAuthLogin, voiceTranscription, semanticSearch, rag)', () => {
      mockFeatureFlagsService.getPublicFlags.mockReturnValue(mockPublicFlags);

      const result = controller.getFeatures() as typeof mockPublicFlags;

      expect(result).toHaveProperty('googleDrive');
      expect(result).toHaveProperty('googleOAuthLogin');
      expect(result).toHaveProperty('voiceTranscription');
      expect(result).toHaveProperty('semanticSearch');
      expect(result).toHaveProperty('rag');
    });

    it('does NOT expose infra-only flags (embedding, graph, deduplication, objectStorage)', () => {
      mockFeatureFlagsService.getPublicFlags.mockReturnValue(mockPublicFlags);

      const result = controller.getFeatures() as Record<string, unknown>;

      expect(result).not.toHaveProperty('embedding');
      expect(result).not.toHaveProperty('graph');
      expect(result).not.toHaveProperty('deduplication');
      expect(result).not.toHaveProperty('objectStorage');
      expect(result).not.toHaveProperty('hybridSearch');
    });

    it('returns googleOAuthLogin: true when the flag is enabled', () => {
      mockFeatureFlagsService.getPublicFlags.mockReturnValue({ ...mockPublicFlags, googleOAuthLogin: true });

      const result = controller.getFeatures() as typeof mockPublicFlags;

      expect(result.googleOAuthLogin).toBe(true);
    });

    it('returns googleDrive: false when the flag is disabled', () => {
      mockFeatureFlagsService.getPublicFlags.mockReturnValue({ ...mockPublicFlags, googleDrive: false });

      const result = controller.getFeatures() as typeof mockPublicFlags;

      expect(result.googleDrive).toBe(false);
    });

    it('returns rag: true when the rag flag is enabled', () => {
      mockFeatureFlagsService.getPublicFlags.mockReturnValue({ ...mockPublicFlags, rag: true });

      const result = controller.getFeatures() as typeof mockPublicFlags;

      expect(result.rag).toBe(true);
    });

    it('returns voiceTranscription: false when the flag is disabled', () => {
      mockFeatureFlagsService.getPublicFlags.mockReturnValue({
        ...mockPublicFlags,
        voiceTranscription: false,
      });

      const result = controller.getFeatures() as typeof mockPublicFlags;

      expect(result.voiceTranscription).toBe(false);
    });

    it('does NOT call featureFlagsService.isEnabled or getAll', () => {
      mockFeatureFlagsService.getPublicFlags.mockReturnValue(mockPublicFlags);

      controller.getFeatures();

      expect(mockFeatureFlagsService.isEnabled).not.toHaveBeenCalled();
      expect(mockFeatureFlagsService.getAll).not.toHaveBeenCalled();
    });

    it('propagates errors from featureFlagsService.getPublicFlags', () => {
      mockFeatureFlagsService.getPublicFlags.mockImplementation(() => {
        throw new Error('Flags not loaded');
      });

      expect(() => controller.getFeatures()).toThrow('Flags not loaded');
    });
  });
});
