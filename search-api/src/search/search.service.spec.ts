import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { SearchService } from './search.service';
import { Bm25Service } from './bm25.service';
import { SemanticService } from './semantic.service';
import { RrfService } from './rrf.service';
import { SearchRequestDto, SearchType } from './dto/search-request.dto';
import { SearchResult } from './dto/search-response.dto';
import { getLoggerToken } from 'nestjs-pino';

/** Helper to create a minimal SearchResult. */
function makeResult(id: string, score: number): SearchResult {
  return {
    id,
    fileId: `file-${id}`,
    filename: `${id}.md`,
    content: `Content for ${id}`,
    score,
    chunkIndex: 0,
    metadata: {},
  };
}

/** Helper to build a valid SearchRequestDto. */
function makeDto(overrides: Partial<SearchRequestDto> = {}): SearchRequestDto {
  const dto = new SearchRequestDto();
  dto.query = 'machine learning';
  dto.limit = 10;
  dto.searchType = SearchType.HYBRID;
  return Object.assign(dto, overrides);
}

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('SearchService', () => {
  let service: SearchService;
  let bm25Service: jest.Mocked<Bm25Service>;
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
    const bm25Mock = { search: jest.fn() };
    const semanticMock = { search: jest.fn() };
    const rrfMock = { fuse: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: Bm25Service, useValue: bm25Mock },
        { provide: SemanticService, useValue: semanticMock },
        { provide: RrfService, useValue: rrfMock },
        { provide: getLoggerToken(SearchService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    bm25Service = module.get(Bm25Service);
    semanticService = module.get(SemanticService);
    rrfService = module.get(RrfService);
    jest.clearAllMocks();
  });

  describe('search() — mode routing', () => {
    it('should call only bm25Service when searchType is "keyword"', async () => {
      const results = [makeResult('chunk-k', 0.9)];
      bm25Service.search.mockResolvedValueOnce(results);

      const dto = makeDto({ searchType: SearchType.KEYWORD });
      const response = await service.search(dto, USER_ID);

      expect(bm25Service.search).toHaveBeenCalledTimes(1);
      expect(semanticService.search).not.toHaveBeenCalled();
      expect(rrfService.fuse).not.toHaveBeenCalled();
      expect(response.results).toEqual(results);
      expect(response.searchType).toBe(SearchType.KEYWORD);
    });

    it('should call only semanticService when searchType is "semantic"', async () => {
      const results = [makeResult('chunk-s', 0.85)];
      semanticService.search.mockResolvedValueOnce(results);

      const dto = makeDto({ searchType: SearchType.SEMANTIC });
      const response = await service.search(dto, USER_ID);

      expect(semanticService.search).toHaveBeenCalledTimes(1);
      expect(bm25Service.search).not.toHaveBeenCalled();
      expect(rrfService.fuse).not.toHaveBeenCalled();
      expect(response.results).toEqual(results);
      expect(response.searchType).toBe(SearchType.SEMANTIC);
    });

    it('should call both services and fuse results when searchType is "hybrid"', async () => {
      const bm25Results = [makeResult('chunk-k', 0.8)];
      const semanticResults = [makeResult('chunk-s', 0.7)];
      const fused = [makeResult('chunk-k', 0.016), makeResult('chunk-s', 0.015)];

      bm25Service.search.mockResolvedValueOnce(bm25Results);
      semanticService.search.mockResolvedValueOnce(semanticResults);
      rrfService.fuse.mockReturnValueOnce(fused);

      const dto = makeDto({ searchType: SearchType.HYBRID, limit: 10 });
      const response = await service.search(dto, USER_ID);

      expect(bm25Service.search).toHaveBeenCalledTimes(1);
      expect(semanticService.search).toHaveBeenCalledTimes(1);
      expect(rrfService.fuse).toHaveBeenCalledWith(
        [bm25Results, semanticResults],
        10,
      );
      expect(response.results).toHaveLength(2);
      expect(response.searchType).toBe(SearchType.HYBRID);
    });

    it('should default to hybrid when searchType is omitted', async () => {
      bm25Service.search.mockResolvedValueOnce([]);
      semanticService.search.mockResolvedValueOnce([]);
      rrfService.fuse.mockReturnValueOnce([]);

      const dto = makeDto({ searchType: undefined });
      const response = await service.search(dto, USER_ID);

      expect(rrfService.fuse).toHaveBeenCalledTimes(1);
      expect(response.searchType).toBe(SearchType.HYBRID);
    });
  });

  describe('search() — validation', () => {
    it('should throw 400 when query is empty', async () => {
      const dto = makeDto({ query: '' });
      await expect(service.search(dto, USER_ID)).rejects.toBeInstanceOf(HttpException);
    });

    it('should throw 400 when query is whitespace only', async () => {
      const dto = makeDto({ query: '   ' });
      await expect(service.search(dto, USER_ID)).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('search() — response shape', () => {
    it('should include took (ms) in the response', async () => {
      bm25Service.search.mockResolvedValueOnce([]);
      const response = await service.search(makeDto({ searchType: SearchType.KEYWORD }), USER_ID);
      expect(typeof response.took).toBe('number');
      expect(response.took).toBeGreaterThanOrEqual(0);
    });

    it('should include total matching results count', async () => {
      const results = [makeResult('c1', 0.9), makeResult('c2', 0.8)];
      bm25Service.search.mockResolvedValueOnce(results);
      const response = await service.search(makeDto({ searchType: SearchType.KEYWORD }), USER_ID);
      expect(response.total).toBe(2);
    });

    it('should propagate a 500 when a search stage throws unexpectedly', async () => {
      bm25Service.search.mockRejectedValueOnce(new Error('DB down'));
      const dto = makeDto({ searchType: SearchType.KEYWORD });
      await expect(service.search(dto, USER_ID)).rejects.toBeInstanceOf(HttpException);
    });
  });
});
