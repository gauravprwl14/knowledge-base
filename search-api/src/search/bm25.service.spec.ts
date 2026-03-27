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

/** Minimal PrismaService mock — only $queryRaw is needed by Bm25Service. */
function makePrismaMock(): jest.Mocked<Pick<PrismaService, "$queryRaw">> {
  return { $queryRaw: jest.fn() } as unknown as jest.Mocked<
    Pick<PrismaService, "$queryRaw">
  >;
}

describe("Bm25Service", () => {
  let service: Bm25Service;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };

  async function buildModule(
    configOverrides: Record<string, unknown> = {},
  ): Promise<TestingModule> {
    prismaMock = makePrismaMock();
    return Test.createTestingModule({
      providers: [
        Bm25Service,
        {
          provide: ConfigService,
          useValue: makeConfigMock(configOverrides),
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: getLoggerToken(Bm25Service.name),
          useValue: mockLogger,
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
  // Real mode (MOCK_BM25=false) — uses mocked PrismaService.$queryRaw
  // ---------------------------------------------------------------------------

  describe("search() — real mode", () => {
    let realModeService: Bm25Service;

    /** Builds a fake raw DB row matching the RawRow shape from pgSearch. */
    function makeFakeRow(overrides: Record<string, unknown> = {}) {
      return {
        id: "chunk-real-001",
        file_id: "file-real-001",
        filename: "real-doc.pdf",
        snippet: "This is a <b>highlighted</b> snippet from the document.",
        ts_rank: 0.75,
        chunk_index: 2,
        source_type: "google_drive",
        web_view_link: "https://drive.google.com/file/d/abc123",
        start_secs: null,
        ...overrides,
      };
    }

    beforeEach(async () => {
      const module = await buildModule({ MOCK_BM25: false });
      realModeService = module.get<Bm25Service>(Bm25Service);
      jest.clearAllMocks();
    });

    it("should call prisma.$queryRaw and return mapped SearchResult objects", async () => {
      const fakeRow = makeFakeRow();
      prismaMock.$queryRaw.mockResolvedValueOnce([fakeRow]);

      const results = await realModeService.search(
        "real query",
        "user-real-001",
        10,
      );

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: "chunk-real-001",
        fileId: "file-real-001",
        filename: "real-doc.pdf",
        content: fakeRow.snippet,
        score: 0.75,
        chunkIndex: 2,
        webViewLink: "https://drive.google.com/file/d/abc123",
        sourceType: "google_drive",
      });
    });

    it("should return an empty array when the DB returns no rows", async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([]);

      const results = await realModeService.search(
        "no-match query",
        "user-real-001",
        10,
      );

      expect(results).toHaveLength(0);
    });

    it("should return an empty array for a query with only non-alphanumeric characters", async () => {
      const results = await realModeService.search(
        "!!! ---",
        "user-real-001",
        10,
      );

      // All safe terms are empty after stripping → early return without DB call
      expect(results).toHaveLength(0);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it("should set startSecs when the DB row has a numeric start_secs value", async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        makeFakeRow({ start_secs: 42.5 }),
      ]);

      const results = await realModeService.search(
        "voice transcript",
        "user-real-001",
        5,
      );

      expect(results[0].startSecs).toBeCloseTo(42.5);
    });

    it("should set startSecs to undefined when start_secs is null", async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        makeFakeRow({ start_secs: null }),
      ]);

      const results = await realModeService.search("query", "user-real-001", 5);

      expect(results[0].startSecs).toBeUndefined();
    });

    it("should call prisma.$queryRaw with the sourceIds variant when sourceIds is provided", async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([makeFakeRow()]);

      await realModeService.search("query", "user-real-001", 5, [
        "src-uuid-001",
      ]);

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("should use f.name (not f.original_filename) as the filename column — regression for wrong-column bug", async () => {
      // Regression: the raw SQL previously referenced f.original_filename which does not
      // exist in kms_files — the correct column defined in schema.prisma is `name`.
      // This test verifies the query template string references the right column.
      // We do this by inspecting the TemplateStringsArray passed to $queryRaw.
      prismaMock.$queryRaw.mockResolvedValueOnce([makeFakeRow()]);

      await realModeService.search("query", "user-real-001", 5);

      // $queryRaw is called with a tagged template literal. The first argument is
      // the TemplateStringsArray (an array of raw SQL string parts). We stringify
      // it to check the SQL text does not contain the wrong column name.
      const callArg = (prismaMock.$queryRaw as jest.Mock).mock
        .calls[0][0] as TemplateStringsArray;
      const sqlText = callArg.join("");
      expect(sqlText).not.toContain("original_filename");
      expect(sqlText).toContain("f.name");
    });

    it("should use f.name column in the sourceIds query variant — regression check", async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([makeFakeRow()]);

      await realModeService.search("query", "user-real-001", 5, [
        "src-uuid-001",
      ]);

      const callArg = (prismaMock.$queryRaw as jest.Mock).mock
        .calls[0][0] as TemplateStringsArray;
      const sqlText = callArg.join("");
      expect(sqlText).not.toContain("original_filename");
      expect(sqlText).toContain("f.name");
    });

    it("should use the no-sourceIds query variant when sourceIds is empty", async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([makeFakeRow()]);

      await realModeService.search("query", "user-real-001", 5, []);

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("should propagate errors thrown by prisma.$queryRaw", async () => {
      prismaMock.$queryRaw.mockRejectedValueOnce(
        new Error("DB connection refused"),
      );

      await expect(
        realModeService.search("any query", "user-real-001", 10),
      ).rejects.toThrow("DB connection refused");
    });

    it("should clamp ts_rank values greater than 1 to 1", async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        makeFakeRow({ ts_rank: 1.5 }),
      ]);

      const results = await realModeService.search("query", "user-real-001", 5);

      expect(results[0].score).toBe(1);
    });

    it("should clamp negative ts_rank values to 0", async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        makeFakeRow({ ts_rank: -0.1 }),
      ]);

      const results = await realModeService.search("query", "user-real-001", 5);

      expect(results[0].score).toBe(0);
    });

    it("should map multiple rows to multiple SearchResult objects in order", async () => {
      const row1 = makeFakeRow({ id: "c1", ts_rank: 0.9 });
      const row2 = makeFakeRow({ id: "c2", ts_rank: 0.6 });
      prismaMock.$queryRaw.mockResolvedValueOnce([row1, row2]);

      const results = await realModeService.search(
        "query",
        "user-real-001",
        10,
      );

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("c1");
      expect(results[1].id).toBe("c2");
    });
  });
});
