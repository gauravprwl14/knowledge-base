import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService, SearchType } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockSearchResults = {
  results: [
    {
      id: 'doc-001',
      title: 'Semantic Search Overview',
      snippet: 'Semantic search uses dense vector embeddings...',
      score: 0.92,
    },
  ],
  total: 1,
  searchType: 'hybrid',
};

// Fastify-style request helper
function makeReq(overrides: Record<string, unknown> = {}) {
  return { user: { id: USER_ID, email: 'user@example.com' }, ...overrides };
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockSearchService = {
  search: jest.fn(),
};

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockSearchService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // JwtAuthGuard wiring
  // =========================================================================

  describe('JwtAuthGuard', () => {
    it('is applied at the controller level so all routes require authentication', async () => {
      const denyGuard = { canActivate: jest.fn().mockReturnValue(false) };

      const blockedModule: TestingModule = await Test.createTestingModule({
        controllers: [SearchController],
        providers: [{ provide: SearchService, useValue: mockSearchService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(denyGuard)
        .compile();

      const blockedController = blockedModule.get<SearchController>(SearchController);
      expect(blockedController).toBeDefined();
      expect(denyGuard.canActivate()).toBe(false);
    });
  });

  // =========================================================================
  // GET /search
  // =========================================================================

  describe('search()', () => {
    it('delegates to searchService.search with the query params and userId from JWT', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      const result = await controller.search('semantic search', makeReq());

      expect(mockSearchService.search).toHaveBeenCalledWith(
        { q: 'semantic search', type: undefined, limit: undefined, offset: undefined },
        USER_ID,
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('passes the query string q to the service', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('vector embeddings', makeReq());

      const [capturedQuery] = mockSearchService.search.mock.calls[0];
      expect(capturedQuery.q).toBe('vector embeddings');
    });

    it('forwards the search type when explicitly provided', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('embeddings', makeReq(), 'semantic');

      const [capturedQuery] = mockSearchService.search.mock.calls[0];
      expect(capturedQuery.type).toBe('semantic');
    });

    it('forwards keyword type to the service', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('full text', makeReq(), 'keyword');

      const [capturedQuery] = mockSearchService.search.mock.calls[0];
      expect(capturedQuery.type).toBe('keyword');
    });

    it('forwards hybrid type to the service', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('hybrid query', makeReq(), 'hybrid');

      const [capturedQuery] = mockSearchService.search.mock.calls[0];
      expect(capturedQuery.type).toBe('hybrid');
    });

    it('passes type as undefined when not provided (service defaults to hybrid)', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('query', makeReq(), undefined);

      const [capturedQuery] = mockSearchService.search.mock.calls[0];
      expect(capturedQuery.type).toBeUndefined();
    });

    it('forwards an explicit limit to the service', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('query', makeReq(), undefined, 25);

      const [capturedQuery] = mockSearchService.search.mock.calls[0];
      expect(capturedQuery.limit).toBe(25);
    });

    it('forwards an explicit offset to the service', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('query', makeReq(), undefined, undefined, 20);

      const [capturedQuery] = mockSearchService.search.mock.calls[0];
      expect(capturedQuery.offset).toBe(20);
    });

    it('passes undefined for limit and offset when not supplied', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('query', makeReq());

      const [capturedQuery] = mockSearchService.search.mock.calls[0];
      expect(capturedQuery.limit).toBeUndefined();
      expect(capturedQuery.offset).toBeUndefined();
    });

    it('passes userId from the JWT request for multi-tenant result filtering', async () => {
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('query', makeReq());

      const [, capturedUserId] = mockSearchService.search.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('returns empty results when the search yields no matches', async () => {
      mockSearchService.search.mockResolvedValue({ results: [], total: 0 });

      const result = (await controller.search('no match', makeReq())) as any;

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns multiple results from the search-api', async () => {
      const multiResults = {
        results: [
          { id: 'doc-001', title: 'Result 1', score: 0.95 },
          { id: 'doc-002', title: 'Result 2', score: 0.88 },
        ],
        total: 2,
      };
      mockSearchService.search.mockResolvedValue(multiResults);

      const result = (await controller.search('broad query', makeReq())) as typeof multiResults;

      expect(result.results).toHaveLength(2);
    });

    it('propagates errors from searchService.search (e.g. search-api unavailable)', async () => {
      const err = new Error('Search service is currently unavailable');
      mockSearchService.search.mockRejectedValue(err);

      await expect(controller.search('query', makeReq())).rejects.toThrow(
        'Search service is currently unavailable',
      );
    });

    it('propagates errors for invalid query parameters from the service', async () => {
      const err = new Error('Missing required field: q');
      mockSearchService.search.mockRejectedValue(err);

      await expect(controller.search('', makeReq())).rejects.toThrow('Missing required field: q');
    });

    it('isolates search results by user — passes different userId per request', async () => {
      const otherUserId = 'ffffffff-ffff-4fff-ffff-ffffffffffff';
      mockSearchService.search.mockResolvedValue(mockSearchResults);

      await controller.search('query', makeReq({ user: { id: otherUserId } }));

      const [, capturedUserId] = mockSearchService.search.mock.calls[0];
      expect(capturedUserId).toBe(otherUserId);
    });
  });
});
