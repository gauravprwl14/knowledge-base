import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';

// ---------------------------------------------------------------------------
// Mock ConfigService
// ---------------------------------------------------------------------------

const mockConfigService = {
  get: jest.fn(),
};

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // Controller instantiation
  // =========================================================================

  describe('controller instantiation', () => {
    it('is defined', () => {
      expect(controller).toBeDefined();
    });
  });

  // =========================================================================
  // GET /health — liveness probe
  // =========================================================================

  describe('health() — GET /health', () => {
    it('returns 200 with status "ok"', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = controller.health();

      expect(result.status).toBe('ok');
    });

    it('returns service name "search-api"', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = controller.health();

      expect(result.service).toBe('search-api');
    });

    it('returns a numeric uptime value', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = controller.health();

      expect(typeof result.uptime).toBe('number');
      expect(result.uptime as number).toBeGreaterThanOrEqual(0);
    });

    it('returns version "1.0.0"', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = controller.health();

      expect(result.version).toBe('1.0.0');
    });

    it('defaults mockBm25 to true when MOCK_BM25 env var is not set', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'MOCK_BM25') return undefined;
        if (key === 'MOCK_SEMANTIC') return undefined;
        return undefined;
      });

      const result = controller.health();

      // Default is true when config returns undefined
      expect(result.mockBm25).toBe(true);
    });

    it('defaults mockSemantic to true when MOCK_SEMANTIC env var is not set', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'MOCK_BM25') return undefined;
        if (key === 'MOCK_SEMANTIC') return undefined;
        return undefined;
      });

      const result = controller.health();

      expect(result.mockSemantic).toBe(true);
    });

    it('reflects MOCK_BM25=false when config returns false', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'MOCK_BM25') return false;
        return undefined;
      });

      const result = controller.health();

      expect(result.mockBm25).toBe(false);
    });

    it('reflects MOCK_SEMANTIC=false when config returns false', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'MOCK_SEMANTIC') return false;
        return undefined;
      });

      const result = controller.health();

      expect(result.mockSemantic).toBe(false);
    });

    it('reads mock flags from ConfigService', () => {
      mockConfigService.get.mockReturnValue(undefined);

      controller.health();

      expect(mockConfigService.get).toHaveBeenCalledWith('MOCK_BM25');
      expect(mockConfigService.get).toHaveBeenCalledWith('MOCK_SEMANTIC');
    });

    it('does not throw when all config values are undefined', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => controller.health()).not.toThrow();
    });
  });
});
