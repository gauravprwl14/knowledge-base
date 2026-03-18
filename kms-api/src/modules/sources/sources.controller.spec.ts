import { Test, TestingModule } from '@nestjs/testing';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SourceStatus, SourceType } from '@prisma/client';

const mockSourcesService = {
  listSources: jest.fn(),
  getSource: jest.fn(),
  getOAuthUrl: jest.fn(),
  handleGoogleCallback: jest.fn(),
  disconnectSource: jest.fn(),
  registerLocalSource: jest.fn(),
  registerObsidianVault: jest.fn(),
};

const userId = 'user-uuid-001';
const sourceId = 'src-uuid-001';

const mockSource = {
  id: sourceId,
  userId,
  type: SourceType.GOOGLE_DRIVE,
  status: SourceStatus.ACTIVE,
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
      .compile();

    controller = module.get(SourcesController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('delegates to sourcesService.listSources and returns result', async () => {
      mockSourcesService.listSources.mockResolvedValue([mockSource]);

      const result = await controller.list(userId);
      expect(result).toHaveLength(1);
      expect(mockSourcesService.listSources).toHaveBeenCalledWith(userId);
    });
  });

  describe('getById', () => {
    it('returns single source by id', async () => {
      mockSourcesService.getSource.mockResolvedValue(mockSource);

      const result = await controller.getById(sourceId, userId);
      expect(result.id).toBe(sourceId);
    });
  });

  describe('disconnect', () => {
    it('calls disconnectSource and returns updated source', async () => {
      const disconnected = { ...mockSource, status: SourceStatus.DISCONNECTED };
      mockSourcesService.disconnectSource.mockResolvedValue(disconnected);

      const result = await controller.disconnect(sourceId, userId);
      expect(result.status).toBe(SourceStatus.DISCONNECTED);
    });
  });

  describe('registerLocalSource', () => {
    it('calls registerLocalSource and returns created source', async () => {
      const dto = { path: '/home/user/notes', displayName: 'Notes' };
      const created = { ...mockSource, type: SourceType.LOCAL, displayName: 'Notes' };
      mockSourcesService.registerLocalSource.mockResolvedValue(created);

      const result = await controller.registerLocalSource(userId, dto as any);
      expect(result.type).toBe(SourceType.LOCAL);
    });
  });

  describe('registerObsidianVault', () => {
    it('calls registerObsidianVault and returns created source', async () => {
      const dto = { vaultPath: '/home/user/vault', displayName: 'Vault' };
      const created = { ...mockSource, type: SourceType.OBSIDIAN, displayName: 'Vault' };
      mockSourcesService.registerObsidianVault.mockResolvedValue(created);

      const result = await controller.registerObsidianVault(userId, dto as any);
      expect(result.type).toBe(SourceType.OBSIDIAN);
    });
  });
});
