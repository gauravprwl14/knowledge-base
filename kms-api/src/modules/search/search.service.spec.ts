import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SearchService } from './search.service';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('http://search-api:8001'),
};

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(SearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('search — happy path', () => {
    it('returns parsed JSON from search-api', async () => {
      const mockResponse = { results: [{ id: '1', content: 'hello' }], total: 1 };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await service.search({ q: 'hello' }, 'user-1');
      expect(result).toEqual(mockResponse);
    });

    it('forwards x-user-id header', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as any);

      await service.search({ q: 'test', type: 'hybrid', limit: 5 }, 'user-abc');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers['x-user-id']).toBe('user-abc');
    });

    it('sends POST with correct JSON body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as any);

      await service.search({ q: 'my query', type: 'semantic', limit: 20 }, 'user-1');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ query: 'my query', searchType: 'semantic', limit: 20 });
    });

    it('defaults to hybrid search and limit 10 when not provided', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as any);

      await service.search({ q: 'test' }, 'user-1');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.searchType).toBe('hybrid');
      expect(body.limit).toBe(10);
    });
  });

  describe('search — error paths', () => {
    it('throws EXT.SERVICE_UNAVAILABLE when fetch rejects', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));

      await expect(service.search({ q: 'test' }, 'user-1')).rejects.toThrow(AppError);
      const err = await service.search({ q: 'test' }, 'user-1').catch((e) => e);
      expect(err.code).toMatch(/EXT/);
    });

    it('throws AppError when search-api returns 500', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as any);

      await expect(service.search({ q: 'test' }, 'user-1')).rejects.toThrow(AppError);
    });

    it('throws AppError when search-api returns 400', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
      } as any);

      await expect(service.search({ q: 'test' }, 'user-1')).rejects.toThrow(AppError);
    });

    it('throws SERVICE_UNAVAILABLE on timeout (AbortError)', async () => {
      global.fetch = jest.fn().mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      );

      await expect(service.search({ q: 'timeout' }, 'user-1')).rejects.toThrow(AppError);
    });
  });
});
