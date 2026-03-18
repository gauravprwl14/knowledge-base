import { Test, TestingModule } from '@nestjs/testing';
import { ContentStoreService } from './content-store.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

const mockConfig = {
  get: jest.fn().mockReturnValue('/tmp/kms-test-content'),
};

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('ContentStoreService', () => {
  let service: ContentStoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentStoreService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(ContentStoreService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('write', () => {
    it('writes content to the correct path and returns it', async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const filePath = await service.write('job-001', '# Hello\ncontent here');
      expect(filePath).toContain('job-001.md');
      expect(filePath).toContain('/tmp/kms-test-content');
    });

    it('calls fs.mkdir with recursive:true to ensure directory exists', async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await service.write('job-001', 'content');
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/kms-test-content', { recursive: true });
    });

    it('throws AppError when writeFile fails', async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockRejectedValue(new Error('ENOSPC: No space left'));

      await expect(service.write('job-fail', 'content')).rejects.toThrow(AppError);
    });

    it('throws AppError when mkdir fails', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('EPERM: permission denied'));

      await expect(service.write('job-fail', 'content')).rejects.toThrow(AppError);
    });
  });

  describe('read', () => {
    it('reads and returns file content', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('# Stored content');

      const content = await service.read('job-001');
      expect(content).toBe('# Stored content');
    });

    it('throws AppError when file does not exist', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      (fs.readFile as jest.Mock).mockRejectedValue(err);

      await expect(service.read('missing')).rejects.toThrow(AppError);
    });
  });
});
