import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaService: jest.Mocked<Pick<PrismaService, 'isHealthy'>>;

  beforeEach(async () => {
    const prismaMock = {
      isHealthy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prismaService = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('liveness() — GET /health', () => {
    it('should return { status: "ok" }', () => {
      const result = controller.liveness();
      expect(result.status).toBe('ok');
    });

    it('should return service name "search-api"', () => {
      const result = controller.liveness();
      expect(result.service).toBe('search-api');
    });

    it('should return a valid ISO-8601 timestamp', () => {
      const result = controller.liveness();
      const ts = new Date(result.timestamp as string);
      expect(ts.toISOString()).toBe(result.timestamp);
    });

    it('should not require database access', () => {
      controller.liveness();
      expect(prismaService.isHealthy).not.toHaveBeenCalled();
    });
  });

  describe('readiness() — GET /health/ready', () => {
    it('should return { status: "ok", database: true } when database is healthy', async () => {
      (prismaService.isHealthy as jest.Mock).mockResolvedValueOnce(true);

      const result = await controller.readiness();

      expect(result.status).toBe('ok');
      expect(result.database).toBe(true);
    });

    it('should return { status: "degraded", database: false } when database is unhealthy', async () => {
      (prismaService.isHealthy as jest.Mock).mockResolvedValueOnce(false);

      const result = await controller.readiness();

      expect(result.status).toBe('degraded');
      expect(result.database).toBe(false);
    });

    it('should call prismaService.isHealthy()', async () => {
      (prismaService.isHealthy as jest.Mock).mockResolvedValueOnce(true);

      await controller.readiness();

      expect(prismaService.isHealthy).toHaveBeenCalledTimes(1);
    });

    it('should return a valid ISO-8601 timestamp', async () => {
      (prismaService.isHealthy as jest.Mock).mockResolvedValueOnce(true);

      const result = await controller.readiness();
      const ts = new Date(result.timestamp as string);
      expect(ts.toISOString()).toBe(result.timestamp);
    });
  });
});
