import { Test, TestingModule } from '@nestjs/testing';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { SourceStatus, SourceType } from '@prisma/client';

const mockSourcesService = {
  listSources: jest.fn(),
  getSource: jest.fn(),
  initiateGoogleDriveOAuth: jest.fn(),
  handleGoogleCallback: jest.fn(),
  disconnectSource: jest.fn(),
  registerLocalSource: jest.fn(),
  registerObsidianVault: jest.fn(),
  getLatestClearJob: jest.fn(),
};

const userId = 'user-uuid-001';
const sourceId = 'src-uuid-001';

const mockSource = {
  id: sourceId,
  userId,
  type: SourceType.GOOGLE_DRIVE,
  status: SourceStatus.CONNECTED,
  displayName: 'My Drive',
  externalId: 'gdrive-user@example.com',
  lastSyncedAt: null,
  createdAt: new Date('2025-01-01'),
};

describe('SourcesController', () => {
  let controller: SourcesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SourcesController],
      providers: [{ provide: SourcesService, useValue: mockSourcesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(FeatureFlagGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SourcesController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listSources', () => {
    it('delegates to sourcesService.listSources and returns result', async () => {
      mockSourcesService.listSources.mockResolvedValue([mockSource]);

      const result = await controller.listSources(userId);
      expect(result).toHaveLength(1);
      expect(mockSourcesService.listSources).toHaveBeenCalledWith(userId);
    });
  });

  describe('getSource', () => {
    it('returns single source by id', async () => {
      mockSourcesService.getSource.mockResolvedValue(mockSource);

      const result = await controller.getSource(sourceId, userId);
      expect(result.id).toBe(sourceId);
    });
  });

  describe('disconnectSource', () => {
    it('calls disconnectSource with clearData=false by default and returns message', async () => {
      mockSourcesService.disconnectSource.mockResolvedValue({});

      const result = await controller.disconnectSource(sourceId, userId, 'false');

      expect(mockSourcesService.disconnectSource).toHaveBeenCalledWith(sourceId, userId, false);
      expect(result).toEqual({ message: 'Source disconnected' });
    });

    it('passes clearData=true and returns jobId in response', async () => {
      mockSourcesService.disconnectSource.mockResolvedValue({ jobId: 'clear-job-001' });

      const result = await controller.disconnectSource(sourceId, userId, 'true');

      expect(mockSourcesService.disconnectSource).toHaveBeenCalledWith(sourceId, userId, true);
      expect(result).toEqual({ message: 'Source disconnected', jobId: 'clear-job-001' });
    });
  });

  describe('getClearStatus', () => {
    it('delegates to sourcesService.getLatestClearJob and returns result', async () => {
      const clearJob = {
        id: 'clear-job-001',
        sourceId,
        userId,
        status: 'RUNNING',
        totalFiles: 5,
        filesCleared: 2,
        chunksCleared: 10,
        vectorsCleared: 10,
        errorMsg: null,
        startedAt: new Date(),
        finishedAt: null,
      };
      mockSourcesService.getLatestClearJob.mockResolvedValue(clearJob);

      const result = await controller.getClearStatus(sourceId, userId);

      expect(mockSourcesService.getLatestClearJob).toHaveBeenCalledWith(userId, sourceId);
      expect(result).toMatchObject({ status: 'RUNNING', filesCleared: 2 });
    });

    it('returns null when no clear job exists', async () => {
      mockSourcesService.getLatestClearJob.mockResolvedValue(null);

      const result = await controller.getClearStatus(sourceId, userId);

      expect(result).toBeNull();
    });
  });

  describe('registerLocalSource', () => {
    it('calls registerLocalSource and returns created source', async () => {
      const dto = { path: '/home/user/notes', displayName: 'Notes' };
      const created = { ...mockSource, type: SourceType.LOCAL, displayName: 'Notes' };
      mockSourcesService.registerLocalSource.mockResolvedValue(created);

      const result = await controller.registerLocalSource(dto as any, userId);
      expect(result.type).toBe(SourceType.LOCAL);
    });
  });

  describe('registerObsidianVault', () => {
    it('calls registerObsidianVault and returns created source', async () => {
      const dto = { vaultPath: '/home/user/vault', displayName: 'Vault' };
      const created = { ...mockSource, type: SourceType.OBSIDIAN, displayName: 'Vault' };
      mockSourcesService.registerObsidianVault.mockResolvedValue(created);

      const result = await controller.registerObsidianVault(dto as any, userId);
      expect(result.type).toBe(SourceType.OBSIDIAN);
    });
  });
});
