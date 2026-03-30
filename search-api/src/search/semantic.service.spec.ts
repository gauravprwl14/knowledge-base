import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getLoggerToken } from 'nestjs-pino';
import { SemanticService } from './semantic.service';
import { SearchResult } from './dto/search-response.dto';

/**
 * Fixed mock scores from the SemanticService implementation.
 * Maintained here so tests remain aligned with the source of truth.
 */
const EXPECTED_MOCK_SCORES: Record<string, number> = {
  'mock-chunk-001': 0.91,
  'mock-chunk-002': 0.78,
  'mock-chunk-003': 0.85,
  'mock-chunk-004': 0.72,
  'mock-chunk-005': 0.80,
};

/** Build a ConfigService mock that enables mock mode by default. */
function makeConfigMock(overrides: Record<string, unknown> = {}): jest.Mocked<ConfigService> {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      const defaults: Record<string, unknown> = {
        MOCK_SEMANTIC: true,
        QDRANT_URL: 'http://localhost:6333',
        QDRANT_COLLECTION: 'kms_chunks',
        ...overrides,
      };
      return defaults[key] ?? undefined;
    }),
  } as unknown as jest.Mocked<ConfigService>;
}

describe('SemanticService', () => {
  let service: SemanticService;

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };

  async function buildModule(configOverrides: Record<string, unknown> = {}): Promise<TestingModule> {
    return Test.createTestingModule({
      providers: [
        SemanticService,
        {
          provide: ConfigService,
          useValue: makeConfigMock(configOverrides),
        },
        {
          provide: getLoggerToken(SemanticService.name),
          useValue: mockLogger,
        },
      ],
    }).compile();
  }

  beforeEach(async () => {
    const module = await buildModule();
    service = module.get<SemanticService>(SemanticService);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Mock mode (MOCK_SEMANTIC=true)
  // ---------------------------------------------------------------------------

  describe('search() — mock mode', () => {
    it('should return an array of SearchResult objects', async () => {
      const results = await service.search('RAG pipeline', 'user-001', 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return results with the required SearchResult shape', async () => {
      const results = await service.search('embedding model', 'user-001', 10);

      for (const result of results) {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('fileId');
        expect(result).toHaveProperty('filename');
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('chunkIndex');

        expect(typeof result.id).toBe('string');
        expect(typeof result.fileId).toBe('string');
        expect(typeof result.filename).toBe('string');
        expect(typeof result.content).toBe('string');
        expect(typeof result.score).toBe('number');
        expect(typeof result.chunkIndex).toBe('number');
      }
    });

    it('should return results sorted by score descending', async () => {
      const results = await service.search('knowledge graph', 'user-001', 10);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should return at most `limit` results when limit is smaller than total mock docs', async () => {
      const results = await service.search('any query', 'user-001', 2);

      expect(results).toHaveLength(2);
    });

    it('should return all 5 mock documents when limit equals 5', async () => {
      const results = await service.search('any query', 'user-001', 5);

      expect(results).toHaveLength(5);
    });

    it('should return at most 5 results even when limit exceeds mock doc count', async () => {
      const results = await service.search('any query', 'user-001', 50);

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return only 1 result when limit=1', async () => {
      const results = await service.search('any query', 'user-001', 1);

      expect(results).toHaveLength(1);
    });

    it('should return results with deterministic scores regardless of query content', async () => {
      const resultsA = await service.search('totally different query', 'user-001', 5);
      const resultsB = await service.search('another random query', 'user-002', 5);

      // Same set of chunk IDs, same scores
      const scoresA = Object.fromEntries(resultsA.map((r) => [r.id, r.score]));
      const scoresB = Object.fromEntries(resultsB.map((r) => [r.id, r.score]));
      expect(scoresA).toEqual(scoresB);
    });

    it('should assign the correct fixed score to each mock chunk', async () => {
      const results = await service.search('any', 'user-001', 5);

      for (const result of results) {
        const expectedScore = EXPECTED_MOCK_SCORES[result.id];
        if (expectedScore !== undefined) {
          expect(result.score).toBeCloseTo(expectedScore, 5);
        }
      }
    });

    it('should return the highest-scoring chunk (mock-chunk-001, score=0.91) first', async () => {
      const results = await service.search('any query', 'user-001', 5);

      expect(results[0].id).toBe('mock-chunk-001');
      expect(results[0].score).toBeCloseTo(0.91, 5);
    });

    it('should return all results with score > 0', async () => {
      const results = await service.search('any query', 'user-001', 5);

      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
      }
    });

    it('should include correct fileId for each mock chunk', async () => {
      const results = await service.search('any query', 'user-001', 5);

      const fileIdMap = Object.fromEntries(results.map((r) => [r.id, r.fileId]));
      expect(fileIdMap['mock-chunk-001']).toBe('mock-file-001');
      expect(fileIdMap['mock-chunk-002']).toBe('mock-file-002');
      expect(fileIdMap['mock-chunk-003']).toBe('mock-file-003');
      expect(fileIdMap['mock-chunk-004']).toBe('mock-file-004');
      expect(fileIdMap['mock-chunk-005']).toBe('mock-file-005');
    });

    it('should include non-empty content for each result', async () => {
      const results = await service.search('any query', 'user-001', 5);

      for (const result of results) {
        expect(result.content.length).toBeGreaterThan(0);
      }
    });

    it('should include metadata as an object on each result', async () => {
      const results = await service.search('any query', 'user-001', 5);

      for (const result of results) {
        expect(result.metadata).toBeDefined();
        expect(typeof result.metadata).toBe('object');
      }
    });

    it('should log a debug message when returning mock results', async () => {
      await service.search('any query', 'user-001', 5);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 }),
        expect.stringContaining('mock mode'),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Real mode (MOCK_SEMANTIC=false) — mocks global fetch
  // ---------------------------------------------------------------------------

  describe('search() — real mode', () => {
    const userId = 'a1b2c3d4-0000-0000-0000-000000000001';

    /** A minimal valid Qdrant point payload. */
    function makeQdrantPoint(id = 'point-001', score = 0.88) {
      return {
        id,
        score,
        payload: {
          file_id: 'file-uuid-001',
          filename: 'design.md',
          content: 'Dense vector retrieval with BGE-M3.',
          chunk_index: 0,
          source_type: 'google_drive',
          web_view_link: 'https://docs.google.com/file/abc',
          start_secs: null,
        },
      };
    }

    /** Stub global fetch to return controlled responses for embed + Qdrant calls. */
    function stubFetch(embedResp: unknown, qdrantResp: unknown): jest.Mock {
      let callCount = 0;
      const fetchMock = jest.fn().mockImplementation(() => {
        callCount++;
        const body = callCount === 1 ? embedResp : qdrantResp;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(body),
          text: () => Promise.resolve(''),
        });
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    afterEach(() => {
      // Restore fetch to avoid leaking across tests
      jest.restoreAllMocks();
    });

    it('should return results mapped from Qdrant payload', async () => {
      stubFetch(
        { embedding: new Array(1024).fill(0.1) },
        { result: [makeQdrantPoint()] },
      );
      const module = await buildModule({ MOCK_SEMANTIC: false });
      const realService = module.get<SemanticService>(SemanticService);

      const results = await realService.search('RAG pipeline', userId, 10);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('point-001');
      expect(results[0].content).toBe('Dense vector retrieval with BGE-M3.');
      expect(results[0].score).toBeCloseTo(0.88);
    });

    it('should populate content from Qdrant payload', async () => {
      stubFetch(
        { embedding: new Array(1024).fill(0.1) },
        { result: [makeQdrantPoint()] },
      );
      const module = await buildModule({ MOCK_SEMANTIC: false });
      const realService = module.get<SemanticService>(SemanticService);

      const results = await realService.search('embedding', userId, 10);

      expect(results[0].content.length).toBeGreaterThan(0);
    });

    it('should populate webViewLink from Qdrant payload', async () => {
      stubFetch(
        { embedding: new Array(1024).fill(0.1) },
        { result: [makeQdrantPoint()] },
      );
      const module = await buildModule({ MOCK_SEMANTIC: false });
      const realService = module.get<SemanticService>(SemanticService);

      const results = await realService.search('embedding', userId, 10);

      expect(results[0].webViewLink).toBe('https://docs.google.com/file/abc');
    });

    it('should populate sourceType from Qdrant payload', async () => {
      stubFetch(
        { embedding: new Array(1024).fill(0.1) },
        { result: [makeQdrantPoint()] },
      );
      const module = await buildModule({ MOCK_SEMANTIC: false });
      const realService = module.get<SemanticService>(SemanticService);

      const results = await realService.search('drive', userId, 10);

      expect(results[0].sourceType).toBe('google_drive');
    });

    it('should return empty array when Qdrant returns no results', async () => {
      stubFetch(
        { embedding: new Array(1024).fill(0.1) },
        { result: [] },
      );
      const module = await buildModule({ MOCK_SEMANTIC: false });
      const realService = module.get<SemanticService>(SemanticService);

      const results = await realService.search('xyznonexistent', userId, 10);

      expect(results).toHaveLength(0);
    });

    it('should throw when embed-worker returns a non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
        json: () => Promise.resolve({}),
      }) as unknown as typeof fetch;
      const module = await buildModule({ MOCK_SEMANTIC: false });
      const realService = module.get<SemanticService>(SemanticService);

      await expect(realService.search('query', userId, 10)).rejects.toThrow();
    });

    it('should throw when Qdrant returns a non-OK status', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ embedding: new Array(1024).fill(0.0) }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        });
      }) as unknown as typeof fetch;

      const module = await buildModule({ MOCK_SEMANTIC: false });
      const realService = module.get<SemanticService>(SemanticService);

      await expect(realService.search('query', userId, 10)).rejects.toThrow();
    });

    it('should throw when embed-worker network call fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof fetch;
      const module = await buildModule({ MOCK_SEMANTIC: false });
      const realService = module.get<SemanticService>(SemanticService);

      await expect(realService.search('query', userId, 10)).rejects.toThrow();
    });
  });
});
