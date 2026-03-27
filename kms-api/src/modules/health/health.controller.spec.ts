import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, PrismaHealthIndicator, HealthCheckResult } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTHY_RESULT: HealthCheckResult = {
  status: 'ok',
  info: { database: { status: 'up' } },
  error: {},
  details: { database: { status: 'up' } },
};

const UNHEALTHY_RESULT: HealthCheckResult = {
  status: 'error',
  info: {},
  error: { database: { status: 'down', message: 'Connection refused' } },
  details: { database: { status: 'down', message: 'Connection refused' } },
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockHealthCheckService: jest.Mocked<Pick<HealthCheckService, 'check'>> = {
  check: jest.fn(),
};

const mockPrismaHealthIndicator: jest.Mocked<Pick<PrismaHealthIndicator, 'pingCheck'>> = {
  pingCheck: jest.fn(),
};

const mockPrismaService = {} as PrismaService;

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: PrismaHealthIndicator, useValue: mockPrismaHealthIndicator },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // GET /health — comprehensive check
  // =========================================================================

  describe('check() — GET /health', () => {
    it('returns 200 with status "ok" when all dependencies are healthy', async () => {
      mockHealthCheckService.check.mockResolvedValue(HEALTHY_RESULT);

      const result = await controller.check();

      expect(result.status).toBe('ok');
    });

    it('includes database connectivity status in the result', async () => {
      mockHealthCheckService.check.mockResolvedValue(HEALTHY_RESULT);

      const result = await controller.check();

      expect(result.info).toBeDefined();
      expect(result.info!.database).toBeDefined();
      expect((result.info as Record<string, { status: string }>)['database'].status).toBe('up');
    });

    it('calls HealthCheckService.check() with a database ping indicator', async () => {
      mockHealthCheckService.check.mockResolvedValue(HEALTHY_RESULT);

      await controller.check();

      expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1);
      // check() receives an array of indicator factory functions
      const [indicators] = mockHealthCheckService.check.mock.calls[0];
      expect(Array.isArray(indicators)).toBe(true);
      expect(indicators).toHaveLength(1);
    });

    it('propagates a HealthCheckResult with status "error" when database is unreachable', async () => {
      mockHealthCheckService.check.mockResolvedValue(UNHEALTHY_RESULT);

      const result = await controller.check();

      expect(result.status).toBe('error');
      expect(result.error!.database).toBeDefined();
    });

    it('propagates an error thrown by HealthCheckService.check()', async () => {
      mockHealthCheckService.check.mockRejectedValue(new Error('Terminus internal failure'));

      await expect(controller.check()).rejects.toThrow('Terminus internal failure');
    });
  });

  // =========================================================================
  // GET /health/ready — readiness probe
  // =========================================================================

  describe('readiness() — GET /health/ready', () => {
    it('returns status "ok" when the service is ready to handle traffic', async () => {
      mockHealthCheckService.check.mockResolvedValue(HEALTHY_RESULT);

      const result = await controller.readiness();

      expect(result.status).toBe('ok');
    });

    it('includes database connectivity in the readiness check', async () => {
      mockHealthCheckService.check.mockResolvedValue(HEALTHY_RESULT);

      const result = await controller.readiness();

      expect(result.info).toBeDefined();
      expect(result.info!.database).toBeDefined();
    });

    it('calls HealthCheckService.check() exactly once', async () => {
      mockHealthCheckService.check.mockResolvedValue(HEALTHY_RESULT);

      await controller.readiness();

      expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1);
    });

    it('returns status "error" when the database is unhealthy', async () => {
      mockHealthCheckService.check.mockResolvedValue(UNHEALTHY_RESULT);

      const result = await controller.readiness();

      expect(result.status).toBe('error');
    });
  });

  // =========================================================================
  // GET /health/live — liveness probe
  // =========================================================================

  describe('liveness() — GET /health/live', () => {
    it('returns status "ok" without querying any dependency', () => {
      const result = controller.liveness();

      expect(result.status).toBe('ok');
    });

    it('returns a valid ISO-8601 timestamp', () => {
      const result = controller.liveness();

      const parsed = new Date(result.timestamp as string);
      expect(isNaN(parsed.getTime())).toBe(false);
      expect(parsed.toISOString()).toBe(result.timestamp);
    });

    it('does NOT call HealthCheckService — liveness does not check dependencies', () => {
      controller.liveness();

      expect(mockHealthCheckService.check).not.toHaveBeenCalled();
    });

    it('does NOT call PrismaHealthIndicator — liveness is dependency-free', () => {
      controller.liveness();

      expect(mockPrismaHealthIndicator.pingCheck).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Controller instantiation
  // =========================================================================

  describe('controller instantiation', () => {
    it('is defined', () => {
      expect(controller).toBeDefined();
    });
  });
});
