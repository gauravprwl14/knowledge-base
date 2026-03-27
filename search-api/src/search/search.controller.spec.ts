import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getLoggerToken } from 'nestjs-pino';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchRequestDto, SearchType } from './dto/search-request.dto';
import { SearchResponseDto } from './dto/search-response.dto';

/** Build a minimal valid SearchRequestDto. */
function makeRequestDto(overrides: Partial<SearchRequestDto> = {}): SearchRequestDto {
  const dto = new SearchRequestDto();
  dto.query = 'RAG pipeline architecture';
  dto.limit = 10;
  dto.searchType = SearchType.HYBRID;
  return Object.assign(dto, overrides);
}

/** Build a minimal SearchResponseDto as returned by SearchService. */
function makeResponse(overrides: Partial<SearchResponseDto> = {}): SearchResponseDto {
  return {
    results: [],
    total: 0,
    searchType: 'hybrid',
    took: 5,
    ...overrides,
  };
}

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: jest.Mocked<SearchService>;
  let configService: jest.Mocked<ConfigService>;

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };

  beforeEach(async () => {
    const searchServiceMock: Partial<jest.Mocked<SearchService>> = {
      search: jest.fn(),
    };

    const configServiceMock: Partial<jest.Mocked<ConfigService>> = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: searchServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: getLoggerToken(SearchController.name), useValue: mockLogger },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
    searchService = module.get(SearchService);
    configService = module.get(ConfigService);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // POST /search
  // ---------------------------------------------------------------------------

  describe('search()', () => {
    it('should delegate to SearchService and return its result when x-user-id is present', async () => {
      const dto = makeRequestDto();
      const expected = makeResponse({ total: 3, results: [] });
      searchService.search.mockResolvedValueOnce(expected);

      const result = await controller.search(dto, 'user-abc');

      expect(searchService.search).toHaveBeenCalledTimes(1);
      expect(searchService.search).toHaveBeenCalledWith(dto, 'user-abc');
      expect(result).toBe(expected);
    });

    it('should trim x-user-id before passing it to SearchService', async () => {
      const dto = makeRequestDto();
      searchService.search.mockResolvedValueOnce(makeResponse());

      await controller.search(dto, '  user-xyz  ');

      expect(searchService.search).toHaveBeenCalledWith(dto, 'user-xyz');
    });

    it('should throw HttpException(400) when x-user-id header is absent (undefined)', async () => {
      const dto = makeRequestDto();

      await expect(controller.search(dto, undefined as unknown as string)).rejects.toThrow(
        new HttpException('x-user-id header is required', HttpStatus.BAD_REQUEST),
      );

      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('should throw HttpException(400) when x-user-id header is an empty string', async () => {
      const dto = makeRequestDto();

      await expect(controller.search(dto, '')).rejects.toThrow(
        new HttpException('x-user-id header is required', HttpStatus.BAD_REQUEST),
      );

      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('should throw HttpException(400) when x-user-id is whitespace only', async () => {
      const dto = makeRequestDto();

      await expect(controller.search(dto, '   ')).rejects.toThrow(
        new HttpException('x-user-id header is required', HttpStatus.BAD_REQUEST),
      );

      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('should propagate HttpException thrown by SearchService', async () => {
      const dto = makeRequestDto();
      const serviceError = new HttpException('Search pipeline error', HttpStatus.INTERNAL_SERVER_ERROR);
      searchService.search.mockRejectedValueOnce(serviceError);

      await expect(controller.search(dto, 'user-abc')).rejects.toThrow(serviceError);
    });

    it('should propagate unexpected errors thrown by SearchService', async () => {
      const dto = makeRequestDto();
      searchService.search.mockRejectedValueOnce(new Error('Unexpected DB failure'));

      await expect(controller.search(dto, 'user-abc')).rejects.toThrow('Unexpected DB failure');
    });

    it('should return SearchResponseDto with correct shape on happy path', async () => {
      const dto = makeRequestDto({ query: 'Neo4j graph', searchType: SearchType.SEMANTIC });
      const response = makeResponse({
        results: [
          {
            id: 'mock-chunk-005',
            fileId: 'mock-file-005',
            filename: 'neo4j-knowledge-graph.md',
            content: 'Neo4j Knowledge Graph content...',
            score: 0.91,
            chunkIndex: 0,
          },
        ],
        total: 1,
        searchType: 'semantic',
        took: 12,
      });
      searchService.search.mockResolvedValueOnce(response);

      const result = await controller.search(dto, 'user-neo4j');

      expect(result.total).toBe(1);
      expect(result.searchType).toBe('semantic');
      expect(result.results[0].filename).toBe('neo4j-knowledge-graph.md');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /search/seed
  // ---------------------------------------------------------------------------

  describe('seed()', () => {
    it('should return seeded document list in non-production environments', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });

      const result = await controller.seed();

      expect(result.seeded).toBe(true);
      expect(result.documents).toHaveLength(5);
    });

    it('should return all five canonical mock documents with id and title', async () => {
      (configService.get as jest.Mock).mockReturnValue('test');

      const result = await controller.seed();

      const ids = result.documents.map((d) => d.id);
      expect(ids).toContain('mock-file-001');
      expect(ids).toContain('mock-file-002');
      expect(ids).toContain('mock-file-003');
      expect(ids).toContain('mock-file-004');
      expect(ids).toContain('mock-file-005');

      for (const doc of result.documents) {
        expect(doc).toHaveProperty('id');
        expect(doc).toHaveProperty('title');
        expect(typeof doc.id).toBe('string');
        expect(typeof doc.title).toBe('string');
      }
    });

    it('should return correct titles for seed documents', async () => {
      (configService.get as jest.Mock).mockReturnValue('development');

      const result = await controller.seed();

      const titles = result.documents.map((d) => d.title);
      expect(titles).toContain('RAG Pipeline Architecture');
      expect(titles).toContain('NestJS Fastify Performance');
      expect(titles).toContain('BGE-M3 Embedding Model');
      expect(titles).toContain('ACP Protocol Integration');
      expect(titles).toContain('Neo4j Knowledge Graph');
    });

    it('should throw HttpException(403) when NODE_ENV is "production"', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      await expect(controller.seed()).rejects.toThrow(
        new HttpException('Seed endpoint is disabled in production', HttpStatus.FORBIDDEN),
      );
    });

    it('should log an info message when seed is called in non-production', async () => {
      (configService.get as jest.Mock).mockReturnValue('test');

      await controller.seed();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ env: 'test' }),
        'search/seed: returning mock document list',
      );
    });

    it('should NOT call searchService.search when seed endpoint is called', async () => {
      (configService.get as jest.Mock).mockReturnValue('development');

      await controller.seed();

      expect(searchService.search).not.toHaveBeenCalled();
    });
  });
});
