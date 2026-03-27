import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_STATS = {
  totalUsers: 10,
  totalSources: 5,
  totalFiles: 100,
  pendingEmbeds: 7,
  processingEmbeds: 3,
  failedFiles: 2,
};

const MOCK_USERS_RESPONSE = {
  data: [
    {
      id: 'user-1',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastLoginAt: null,
    },
  ],
  nextCursor: null,
  total: 1,
};

const MOCK_SOURCES_RESPONSE = {
  data: [
    {
      id: 'src-1',
      userId: 'user-1',
      userEmail: 'admin@example.com',
      type: 'LOCAL',
      name: 'My Vault',
      status: 'IDLE',
      lastScannedAt: null,
      fileCount: 0,
    },
  ],
  nextCursor: null,
  total: 1,
};

const MOCK_SCAN_JOBS_RESPONSE = {
  data: [
    {
      id: 'job-1',
      userId: 'user-1',
      userEmail: 'admin@example.com',
      sourceId: 'src-1',
      sourceName: 'My Vault',
      type: 'FULL',
      status: 'COMPLETED',
      startedAt: null,
      finishedAt: null,
      filesFound: 0,
    },
  ],
  nextCursor: null,
  total: 1,
};

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockAdminService = {
  getStats: jest.fn(),
  getUsers: jest.fn(),
  getSources: jest.fn(),
  getScanJobs: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
      ],
    })
      // Override guards so we don't need JWT/admin infra in unit tests
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AdminController>(AdminController);
  });

  // ── getStats ──────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns the correct stats shape', async () => {
      mockAdminService.getStats.mockResolvedValue(MOCK_STATS);

      const result = await controller.getStats();

      expect(result).toEqual(MOCK_STATS);
      expect(mockAdminService.getStats).toHaveBeenCalledTimes(1);
    });
  });

  // ── getUsers ──────────────────────────────────────────────────────────────

  describe('getUsers()', () => {
    it('returns paginated users with correct shape', async () => {
      mockAdminService.getUsers.mockResolvedValue(MOCK_USERS_RESPONSE);

      const result = await controller.getUsers({});

      expect(result).toEqual(MOCK_USERS_RESPONSE);
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('passes cursor and limit from query to service', async () => {
      mockAdminService.getUsers.mockResolvedValue(MOCK_USERS_RESPONSE);

      await controller.getUsers({ cursor: 'some-cursor', limit: 25 });

      expect(mockAdminService.getUsers).toHaveBeenCalledWith({
        cursor: 'some-cursor',
        limit: 25,
      });
    });

    it('defaults limit to 50 when not provided', async () => {
      mockAdminService.getUsers.mockResolvedValue(MOCK_USERS_RESPONSE);

      await controller.getUsers({});

      expect(mockAdminService.getUsers).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 50,
      });
    });
  });

  // ── getSources ────────────────────────────────────────────────────────────

  describe('getSources()', () => {
    it('returns paginated sources with correct shape', async () => {
      mockAdminService.getSources.mockResolvedValue(MOCK_SOURCES_RESPONSE);

      const result = await controller.getSources({});

      expect(result).toEqual(MOCK_SOURCES_RESPONSE);
      expect(result.data[0]).toHaveProperty('userEmail');
    });

    it('passes cursor and limit from query to service', async () => {
      mockAdminService.getSources.mockResolvedValue(MOCK_SOURCES_RESPONSE);

      await controller.getSources({ cursor: 'src-cursor', limit: 10 });

      expect(mockAdminService.getSources).toHaveBeenCalledWith({
        cursor: 'src-cursor',
        limit: 10,
      });
    });
  });

  // ── getScanJobs ───────────────────────────────────────────────────────────

  describe('getScanJobs()', () => {
    it('returns scan jobs with correct shape', async () => {
      mockAdminService.getScanJobs.mockResolvedValue(MOCK_SCAN_JOBS_RESPONSE);

      const result = await controller.getScanJobs();

      expect(result).toEqual(MOCK_SCAN_JOBS_RESPONSE);
      expect(result.data[0]).toHaveProperty('userEmail');
      expect(result.data[0]).toHaveProperty('sourceName');
    });

    it('AdminGuard is applied as a guard on the controller', () => {
      // Verify the guard metadata is present on the controller class.
      // NestJS stores guards via Reflect metadata.
      const guards = Reflect.getMetadata('__guards__', AdminController);
      const guardNames = guards?.map((g: any) => g.name ?? g) ?? [];
      // Both JwtAuthGuard and AdminGuard should be registered
      expect(guardNames).toContain('JwtAuthGuard');
      expect(guardNames).toContain('AdminGuard');
    });
  });
});
