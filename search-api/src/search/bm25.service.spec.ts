import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getLoggerToken } from "nestjs-pino";
import { Bm25Service } from "./bm25.service";
import { PrismaService } from "../prisma/prisma.service";

/** Build a ConfigService mock. */
function makeConfigMock(
  overrides: Record<string, unknown> = {},
): jest.Mocked<ConfigService> {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      const defaults: Record<string, unknown> = {
        MOCK_BM25: true,
        ...overrides,
      };
      return defaults[key] ?? undefined;
    }),
  } as unknown as jest.Mocked<ConfigService>;
}

/** Build a PrismaService mock. */
function makePrismaMock(queryRawResult: unknown[] = []): jest.Mocked<PrismaService> {
  return {
    $queryRaw: jest.fn().mockResolvedValue(queryRawResult),
  } as unknown as jest.Mocked<PrismaService>;
}

describe("Bm25Service", () => {
  let service: Bm25Service;

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };

  async function buildModule(
    configOverrides: Record<string, unknown> = {},
    prismaMock?: jest.Mocked<PrismaService>,
  ): Promise<TestingModule> {
    return Test.createTestingModule({
      providers: [
        Bm25Service,
        {
          provide: ConfigService,
          useValue: makeConfigMock(configOverrides),
        },
        {
          provide: getLoggerToken(Bm25Service.name),
          useValue: mockLogger,
        },
        {
          provide: PrismaService,
          useValue: prismaMock ?? makePrismaMock(),
        },
      ],
    }).compile();
  }

  beforeEach(async () => {
    const module = await buildModule();
    service = module.get<Bm25Service>(Bm25Service);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Mock mode (MOCK_BM25=true)
  // ---------------------------------------------------------------------------

  describe("search() — mock mode", () => {
    const userId = "user-test-001";

    it("should return an array of SearchResult objects", async () => {
      const results = await service.search("RAG pipeline", userId, 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return results with the required SearchResult shape", async () => {
      const results = await service.search("embedding model", userId, 10);

      for (const result of results) {
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("fileId");
        expect(result).toHaveProperty("filename");
        expect(result).toHaveProperty("content");
        expect(result).toHaveProperty("score");
        expect(result).toHaveProperty("chunkIndex");

        expect(typeof result.id).toBe("string");
        expect(typeof result.fileId).toBe("string");
        expect(typeof result.filename).toBe("string");
        expect(typeof result.content).toBe("string");
        expect(typeof result.score).toBe("number");
        expect(typeof result.chunkIndex).toBe("number");
      }
    });

    it("should return results sorted by score descending", async () => {
      const results = await service.search(
        "rag pipeline architecture",
        userId,
        10,
      );

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it("should return at most `limit` results", async () => {
      const results = await service.search("any query", userId, 2);

      expect(results).toHaveLength(2);
    });

    it("should return all 5 mock documents when limit=5", async () => {
      const results = await service.search("any query", userId, 5);

      expect(results).toHaveLength(5);
    });

    it("should return at most 5 results when limit exceeds mock doc count", async () => {
      const results = await service.search("any query", userId, 50);

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("should return 1 result when limit=1", async () => {
      const results = await service.search("rag pipeline", userId, 1);

      expect(results).toHaveLength(1);
    });

    it("should score a document higher when the query term appears in its content", async () => {
      // "RAG" appears in mock-chunk-001 (RAG Pipeline Architecture)
      const results = await service.search("RAG", userId, 5);
      const ragDoc = results.find((r) => r.id === "mock-chunk-001");

      expect(ragDoc).toBeDefined();
      // RAG doc should have a higher score than the minimum possible
      expect(ragDoc!.score).toBeGreaterThan(0.05);
    });

    it("should assign score > 0.05 to documents with matching terms", async () => {
      // "neo4j" matches mock-chunk-005 explicitly
      const results = await service.search("neo4j", userId, 5);
      const neo4jDoc = results.find((r) => r.id === "mock-chunk-005");

      expect(neo4jDoc).toBeDefined();
      expect(neo4jDoc!.score).toBeGreaterThan(0.05);
    });

    it("should assign a minimum score of 0.05 to documents with no matching terms", async () => {
      // Use an obscure query that matches nothing in any mock doc
      const results = await service.search("xyzabcnonexistent", userId, 5);

      for (const result of results) {
        // All docs should have the floor score of 0.05
        expect(result.score).toBeCloseTo(0.05, 5);
      }
    });

    it("should score the best matching document first", async () => {
      // "RAG pipeline architecture" — multiple terms hit mock-chunk-001
      const results = await service.search(
        "RAG pipeline architecture",
        userId,
        5,
      );

      expect(results[0].id).toBe("mock-chunk-001");
    });

    it("should assign scores in range (0, 1] — never exceeding 0.95", async () => {
      const results = await service.search(
        "RAG BM25 NestJS Neo4j embedding",
        userId,
        5,
      );

      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(0.95);
      }
    });

    it("should return all results with score > 0", async () => {
      const results = await service.search("any query", userId, 5);

      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
      }
    });

    it("should return the correct fileId for each mock chunk", async () => {
      const results = await service.search("any query", userId, 5);

      const fileIdMap = Object.fromEntries(
        results.map((r) => [r.id, r.fileId]),
      );
      expect(fileIdMap["mock-chunk-001"]).toBe("mock-file-001");
      expect(fileIdMap["mock-chunk-002"]).toBe("mock-file-002");
      expect(fileIdMap["mock-chunk-003"]).toBe("mock-file-003");
      expect(fileIdMap["mock-chunk-004"]).toBe("mock-file-004");
      expect(fileIdMap["mock-chunk-005"]).toBe("mock-file-005");
    });

    it("should include non-empty content for every result", async () => {
      const results = await service.search("any query", userId, 5);

      for (const result of results) {
        expect(result.content.length).toBeGreaterThan(0);
      }
    });

    it("should include metadata on each result", async () => {
      const results = await service.search("any query", userId, 5);

      for (const result of results) {
        expect(result.metadata).toBeDefined();
        expect(typeof result.metadata).toBe("object");
      }
    });

    it("should log a debug message when returning mock results", async () => {
      await service.search("RAG pipeline", userId, 5);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ query: "RAG pipeline", limit: 5 }),
        expect.stringContaining("mock mode"),
      );
    });

    it("should handle a multi-term query and rank by cumulative term frequency", async () => {
      // "Qdrant BM25" — both terms hit mock-chunk-001 (mentions both)
      const results = await service.search("Qdrant BM25", userId, 5);

      const topResult = results[0];
      // mock-chunk-001 mentions both Qdrant and BM25
      expect(topResult.id).toBe("mock-chunk-001");
    });

    it("should ignore case differences in query terms", async () => {
      const upperResults = await service.search("RAG PIPELINE", userId, 5);
      const lowerResults = await service.search("rag pipeline", userId, 5);

      // Same ordering regardless of query casing
      expect(upperResults.map((r) => r.id)).toEqual(
        lowerResults.map((r) => r.id),
      );
    });

    it("should accept optional sourceIds parameter without error", async () => {
      const results = await service.search("RAG", userId, 5, [
        "src-001",
        "src-002",
      ]);

      // In mock mode sourceIds are ignored — all 5 docs still returned up to limit
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Real mode (MOCK_BM25=false) — uses mocked PrismaService
  // ---------------------------------------------------------------------------

  describe('search() — real mode', () => {
    const userId = 'a1b2c3d4-0000-0000-0000-000000000001';

    /** Build a realistic DB row as returned by $queryRaw. */
    function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
      return {
        id: 'chunk-uuid-001',
        fileId: 'file-uuid-001',
        filename: 'architecture.md',
        content: 'The RAG pipeline retrieves and generates answers.',
        chunkIndex: 0,
        startSecs: null,
        webViewLink: null,
        score: 0.42,
        snippet: 'The <mark>RAG</mark> pipeline retrieves and generates answers.',
        ...overrides,
      };
    }

    it('should return results mapped from raw DB rows', async () => {
      const rows = [makeRow(), makeRow({ id: 'chunk-uuid-002', score: 0.3 })];
      const prismaMock = makePrismaMock(rows);
      const module = await buildModule({ MOCK_BM25: false }, prismaMock);
      const realService = module.get<Bm25Service>(Bm25Service);

      const results = await realService.search('RAG pipeline', userId, 10);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('chunk-uuid-001');
      expect(results[0].content).toBe('The <mark>RAG</mark> pipeline retrieves and generates answers.');
    });

    it('should return results with non-empty content', async () => {
      const rows = [makeRow()];
      const prismaMock = makePrismaMock(rows);
      const module = await buildModule({ MOCK_BM25: false }, prismaMock);
      const realService = module.get<Bm25Service>(Bm25Service);

      const results = await realService.search('RAG', userId, 10);

      expect(results[0].content.length).toBeGreaterThan(0);
    });

    it('should return an empty array when no rows match', async () => {
      const prismaMock = makePrismaMock([]);
      const module = await buildModule({ MOCK_BM25: false }, prismaMock);
      const realService = module.get<Bm25Service>(Bm25Service);

      const results = await realService.search('xyznonexistent', userId, 10);

      expect(results).toHaveLength(0);
    });

    it('should call $queryRaw once per search invocation', async () => {
      const prismaMock = makePrismaMock([makeRow()]);
      const module = await buildModule({ MOCK_BM25: false }, prismaMock);
      const realService = module.get<Bm25Service>(Bm25Service);

      await realService.search('RAG', userId, 5);

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should map webViewLink from DB row', async () => {
      const rows = [makeRow({ webViewLink: 'https://docs.google.com/file/abc' })];
      const prismaMock = makePrismaMock(rows);
      const module = await buildModule({ MOCK_BM25: false }, prismaMock);
      const realService = module.get<Bm25Service>(Bm25Service);

      const results = await realService.search('RAG', userId, 10);

      expect(results[0].webViewLink).toBe('https://docs.google.com/file/abc');
    });

    it('should map startSecs from DB row for voice transcripts', async () => {
      const rows = [makeRow({ startSecs: 42.5 })];
      const prismaMock = makePrismaMock(rows);
      const module = await buildModule({ MOCK_BM25: false }, prismaMock);
      const realService = module.get<Bm25Service>(Bm25Service);

      const results = await realService.search('meeting', userId, 10);

      expect(results[0].startSecs).toBeCloseTo(42.5);
    });

    it('should pass sourceIds filter in the query when provided', async () => {
      const prismaMock = makePrismaMock([makeRow()]);
      const module = await buildModule({ MOCK_BM25: false }, prismaMock);
      const realService = module.get<Bm25Service>(Bm25Service);

      await realService.search('RAG', userId, 5, ['src-001', 'src-002']);

      // $queryRaw must have been called (sourceIds param passed without error)
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
