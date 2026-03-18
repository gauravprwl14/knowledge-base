import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { KeywordService } from './keyword.service';
import { SemanticService } from './semantic.service';
import { RrfService } from './rrf.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResultItemDto } from './dto/search-result.dto';
import { AppError, ERROR_CODES } from '../errors/app-error';
import { getLoggerToken } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';

/** Helper to create a minimal SearchResultItemDto. */
function makeResult(fileId: string, score: number): SearchResultItemDto {
  return {
    fileId,
    filename: `${fileId}.pdf`,
    mimeType: 'application/pdf',
    sourceId: 'src-001',
    score,
    snippet: `Snippet for ${fileId}`,
    chunkIndex: 0,
  };
}

/** Helper to build a valid SearchQueryDto. */
function makeDto(overrides: Partial<SearchQueryDto> = {}): SearchQueryDto {
  const dto = new SearchQueryDto();
  dto.q = 'machine learning';
  dto.userId = '550e8400-e29b-41d4-a716-446655440000';
  dto.limit = 20;
  dto.offset = 0;
  dto.mode = 'hybrid';
  return Object.assign(dto, overrides);
}

describe('SearchService', () => {
  let service: SearchService;
  let keywordService: jest.Mocked<KeywordService>;
  let semanticService: jest.Mocked<SemanticService>;
  let rrfService: jest.Mocked<RrfService>;

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };

  beforeEach(async () => {
    const keywordMock = { search: jest.fn() };
    const semanticMock = { search: jest.fn() };
    const rrfMock = { merge: jest.fn() };
    // PrismaService mock — SearchService uses it only in seedMockData(), not in search()
    const prismaMock = { $executeRaw: jest.fn(), $queryRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: KeywordService, useValue: keywordMock },
        { provide: SemanticService, useValue: semanticMock },
        { provide: RrfService, useValue: rrfMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: getLoggerToken(SearchService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    keywordService = module.get(KeywordService);
    semanticService = module.get(SemanticService);
    rrfService = module.get(RrfService);
    jest.clearAllMocks();
  });

  describe('search() — mode routing', () => {
    it('should call only keywordService when mode is "keyword"', async () => {
      const results = [makeResult('file-k', 0.9)];
      keywordService.search.mockResolvedValueOnce(results);

      const dto = makeDto({ mode: 'keyword' });
      const response = await service.search(dto);

      expect(keywordService.search).toHaveBeenCalledTimes(1);
      expect(semanticService.search).not.toHaveBeenCalled();
      expect(rrfService.merge).not.toHaveBeenCalled();
      expect(response.results).toEqual(results);
      expect(response.mode).toBe('keyword');
    });

    it('should call only semanticService when mode is "semantic"', async () => {
      const results = [makeResult('file-s', 0.85)];
      semanticService.search.mockResolvedValueOnce(results);

      const dto = makeDto({ mode: 'semantic' });
      const response = await service.search(dto);

      expect(semanticService.search).toHaveBeenCalledTimes(1);
      expect(keywordService.search).not.toHaveBeenCalled();
      expect(rrfService.merge).not.toHaveBeenCalled();
      expect(response.results).toEqual(results);
      expect(response.mode).toBe('semantic');
    });

    it('should call both services and merge results when mode is "hybrid"', async () => {
      const kResults = [makeResult('file-k', 0.8)];
      const sResults = [makeResult('file-s', 0.7)];
      const merged = [makeResult('file-k', 0.016), makeResult('file-s', 0.015)];

      keywordService.search.mockResolvedValueOnce(kResults);
      semanticService.search.mockResolvedValueOnce(sResults);
      rrfService.merge.mockReturnValueOnce(merged);

      const dto = makeDto({ mode: 'hybrid' });
      const response = await service.search(dto);

      expect(keywordService.search).toHaveBeenCalledTimes(1);
      expect(semanticService.search).toHaveBeenCalledTimes(1);
      expect(rrfService.merge).toHaveBeenCalledWith(kResults, sResults);
      expect(response.results).toHaveLength(2);
      expect(response.mode).toBe('hybrid');
    });

    it('should apply limit/offset after RRF merge in hybrid mode', async () => {
      const merged = Array.from({ length: 10 }, (_, i) => makeResult(`file-${i}`, 0.9 - i * 0.05));
      rrfService.merge.mockReturnValueOnce(merged);
      keywordService.search.mockResolvedValueOnce([]);
      semanticService.search.mockResolvedValueOnce([]);

      // Ask for 3 results starting at offset 2
      const dto = makeDto({ mode: 'hybrid', limit: 3, offset: 2 });
      const response = await service.search(dto);

      expect(response.results).toHaveLength(3);
      expect(response.results[0].fileId).toBe('file-2');
    });
  });

  describe('search() — validation', () => {
    it('should throw AppError KBSCH0001 when query is empty', async () => {
      const dto = makeDto({ q: '' });
      await expect(service.search(dto)).rejects.toMatchObject({
        code: ERROR_CODES.SCH.QUERY_REQUIRED.code,
      });
    });

    it('should throw AppError KBSCH0001 when query is whitespace only', async () => {
      const dto = makeDto({ q: '   ' });
      await expect(service.search(dto)).rejects.toMatchObject({
        code: ERROR_CODES.SCH.QUERY_REQUIRED.code,
      });
    });
  });

  describe('search() — error handling', () => {
    it('should throw AppError KBSCH0002 when keyword search throws an unexpected error', async () => {
      keywordService.search.mockRejectedValueOnce(new Error('DB down'));

      const dto = makeDto({ mode: 'keyword' });
      await expect(service.search(dto)).rejects.toMatchObject({
        code: ERROR_CODES.SCH.SEARCH_FAILED.code,
      });
    });

    it('should re-throw AppError as-is when thrown by a downstream service', async () => {
      const appErr = new AppError({ code: ERROR_CODES.SCH.SEARCH_FAILED.code });
      keywordService.search.mockRejectedValueOnce(appErr);

      const dto = makeDto({ mode: 'keyword' });
      await expect(service.search(dto)).rejects.toBe(appErr);
    });

    it('should include took_ms in the response', async () => {
      keywordService.search.mockResolvedValueOnce([]);
      const response = await service.search(makeDto({ mode: 'keyword' }));
      expect(response.took_ms).toBeGreaterThanOrEqual(0);
      expect(typeof response.took_ms).toBe('number');
    });

    it('should include total matching results count', async () => {
      const results = [makeResult('f1', 0.9), makeResult('f2', 0.8)];
      keywordService.search.mockResolvedValueOnce(results);
      const response = await service.search(makeDto({ mode: 'keyword' }));
      expect(response.total).toBe(2);
    });
  });
});
