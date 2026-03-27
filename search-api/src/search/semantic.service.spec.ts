import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getLoggerToken } from "nestjs-pino";
import { SemanticService } from "./semantic.service";

/**
 * Fixed mock scores from the SemanticService implementation.
 * Maintained here so tests remain aligned with the source of truth.
 */
const EXPECTED_MOCK_SCORES: Record<string, number> = {
  "mock-chunk-001": 0.91,
  "mock-chunk-002": 0.78,
  "mock-chunk-003": 0.85,
  "mock-chunk-004": 0.72,
  "mock-chunk-005": 0.8,
};

/** Build a ConfigService mock that enables mock mode by default. */
function makeConfigMock(
  overrides: Record<string, unknown> = {},
): jest.Mocked<ConfigService> {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      const defaults: Record<string, unknown> = {
        MOCK_SEMANTIC: true,
        QDRANT_URL: "http://localhost:6333",
        QDRANT_COLLECTION: "kms_chunks",
        ...overrides,
      };
      return defaults[key] ?? undefined;
    }),
  } as unknown as jest.Mocked<ConfigService>;
}

describe("SemanticService", () => {
  let service: SemanticService;

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

  describe("search() — mock mode", () => {
    it("should return an array of SearchResult objects", async () => {
      const results = await service.search("RAG pipeline", "user-001", 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return results with the required SearchResult shape", async () => {
      const results = await service.search("embedding model", "user-001", 10);

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
      const results = await service.search("knowledge graph", "user-001", 10);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it("should return at most `limit` results when limit is smaller than total mock docs", async () => {
      const results = await service.search("any query", "user-001", 2);

      expect(results).toHaveLength(2);
    });

    it("should return all 5 mock documents when limit equals 5", async () => {
      const results = await service.search("any query", "user-001", 5);

      expect(results).toHaveLength(5);
    });

    it("should return at most 5 results even when limit exceeds mock doc count", async () => {
      const results = await service.search("any query", "user-001", 50);

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("should return only 1 result when limit=1", async () => {
      const results = await service.search("any query", "user-001", 1);

      expect(results).toHaveLength(1);
    });

    it("should return results with deterministic scores regardless of query content", async () => {
      const resultsA = await service.search(
        "totally different query",
        "user-001",
        5,
      );
      const resultsB = await service.search(
        "another random query",
        "user-002",
        5,
      );

      // Same set of chunk IDs, same scores
      const scoresA = Object.fromEntries(resultsA.map((r) => [r.id, r.score]));
      const scoresB = Object.fromEntries(resultsB.map((r) => [r.id, r.score]));
      expect(scoresA).toEqual(scoresB);
    });

    it("should assign the correct fixed score to each mock chunk", async () => {
      const results = await service.search("any", "user-001", 5);

      for (const result of results) {
        const expectedScore = EXPECTED_MOCK_SCORES[result.id];
        if (expectedScore !== undefined) {
          expect(result.score).toBeCloseTo(expectedScore, 5);
        }
      }
    });

    it("should return the highest-scoring chunk (mock-chunk-001, score=0.91) first", async () => {
      const results = await service.search("any query", "user-001", 5);

      expect(results[0].id).toBe("mock-chunk-001");
      expect(results[0].score).toBeCloseTo(0.91, 5);
    });

    it("should return all results with score > 0", async () => {
      const results = await service.search("any query", "user-001", 5);

      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
      }
    });

    it("should include correct fileId for each mock chunk", async () => {
      const results = await service.search("any query", "user-001", 5);

      const fileIdMap = Object.fromEntries(
        results.map((r) => [r.id, r.fileId]),
      );
      expect(fileIdMap["mock-chunk-001"]).toBe("mock-file-001");
      expect(fileIdMap["mock-chunk-002"]).toBe("mock-file-002");
      expect(fileIdMap["mock-chunk-003"]).toBe("mock-file-003");
      expect(fileIdMap["mock-chunk-004"]).toBe("mock-file-004");
      expect(fileIdMap["mock-chunk-005"]).toBe("mock-file-005");
    });

    it("should include non-empty content for each result", async () => {
      const results = await service.search("any query", "user-001", 5);

      for (const result of results) {
        expect(result.content.length).toBeGreaterThan(0);
      }
    });

    it("should include metadata as an object on each result", async () => {
      const results = await service.search("any query", "user-001", 5);

      for (const result of results) {
        expect(result.metadata).toBeDefined();
        expect(typeof result.metadata).toBe("object");
      }
    });

    it("should log a debug message when returning mock results", async () => {
      await service.search("any query", "user-001", 5);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 }),
        expect.stringContaining("mock mode"),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Real mode (MOCK_SEMANTIC=false) — mocks global fetch + QdrantClient via spy
  // ---------------------------------------------------------------------------

  describe("search() — real mode", () => {
    let realModeService: SemanticService;

    /** Base payload shape written by embed-worker into Qdrant. */
    const BASE_PAYLOAD = {
      user_id: "user-real-001",
      source_id: "src-001",
      file_id: "file-001",
      filename: "quarterly-report.pdf",
      content: "This quarter saw significant growth in user adoption.",
      chunk_index: 3,
      web_view_link: "https://drive.google.com/file/d/xyz",
      start_secs: null,
      source_type: "google_drive",
    };

    /** A fake Qdrant search point matching the embed-worker payload schema. */
    function makeFakeQdrantPoint(
      payloadOverrides: Record<string, unknown> = {},
      topOverrides: Record<string, unknown> = {},
    ) {
      return {
        id: "qdrant-point-uuid-001",
        score: 0.88,
        payload: { ...BASE_PAYLOAD, ...payloadOverrides },
        ...topOverrides,
      };
    }

    /** The 1024-dim embedding vector stub. */
    const STUB_VECTOR = Array(1024).fill(0.01);

    /** Spy on the QdrantClient prototype's `search` method. */
    let qdrantSearchSpy: jest.SpyInstance;

    beforeEach(async () => {
      // Build the service module with MOCK_SEMANTIC=false
      const module = await buildModule({ MOCK_SEMANTIC: false });
      realModeService = module.get<SemanticService>(SemanticService);

      // Spy on the QdrantClient prototype so any instance's search() is controlled.
      // The spy is set up AFTER the module is built so the lazy client getter works.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { QdrantClient } = require("@qdrant/js-client-rest");
      qdrantSearchSpy = jest
        .spyOn(QdrantClient.prototype, "search")
        .mockResolvedValue([]);

      // Stub global fetch to simulate the embed-worker /embed endpoint
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: STUB_VECTOR }),
      } as unknown as Response);

      jest.clearAllMocks();

      // Re-apply stubs after clearAllMocks
      qdrantSearchSpy.mockResolvedValue([]);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: STUB_VECTOR }),
      } as unknown as Response);
    });

    afterEach(() => {
      qdrantSearchSpy?.mockRestore();
    });

    it("should call fetch to obtain an embedding from the embed-worker", async () => {
      qdrantSearchSpy.mockResolvedValue([makeFakeQdrantPoint()]);

      await realModeService.search("semantic query", "user-real-001", 5);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/embed"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ text: "semantic query" }),
        }),
      );
    });

    it("should use the correct default embed-worker URL (port 8011, not 8004)", async () => {
      // The embed-worker FastAPI app runs on port 8011 — the old default of 8004
      // was a url-agent service that is unrelated to embedding.
      // This test confirms the config default matches the actual service port.
      qdrantSearchSpy.mockResolvedValue([makeFakeQdrantPoint()]);

      await realModeService.search("semantic query", "user-real-001", 5);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      // Must NOT reference port 8004 (url-agent — wrong service)
      expect(fetchCall).not.toContain("8004");
    });

    it("should return mapped SearchResult objects from Qdrant points", async () => {
      qdrantSearchSpy.mockResolvedValue([makeFakeQdrantPoint()]);

      const results = await realModeService.search(
        "semantic query",
        "user-real-001",
        5,
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: "qdrant-point-uuid-001",
        fileId: "file-001",
        filename: "quarterly-report.pdf",
        content: "This quarter saw significant growth in user adoption.",
        score: 0.88,
        chunkIndex: 3,
        webViewLink: "https://drive.google.com/file/d/xyz",
        sourceType: "google_drive",
      });
    });

    it("should return an empty array when Qdrant returns no points", async () => {
      qdrantSearchSpy.mockResolvedValue([]);

      const results = await realModeService.search(
        "no-match query",
        "user-real-001",
        5,
      );

      expect(results).toHaveLength(0);
    });

    it("should set startSecs when the Qdrant payload has a numeric start_secs", async () => {
      qdrantSearchSpy.mockResolvedValue([
        makeFakeQdrantPoint({ start_secs: 12.3 }),
      ]);

      const results = await realModeService.search(
        "voice query",
        "user-real-001",
        5,
      );

      expect(results[0].startSecs).toBeCloseTo(12.3);
    });

    it("should set startSecs to undefined when start_secs is null", async () => {
      qdrantSearchSpy.mockResolvedValue([
        makeFakeQdrantPoint({ start_secs: null }),
      ]);

      const results = await realModeService.search("query", "user-real-001", 5);

      expect(results[0].startSecs).toBeUndefined();
    });

    it("should throw when the embed-worker returns a non-OK status", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as unknown as Response);

      await expect(
        realModeService.search("any query", "user-real-001", 5),
      ).rejects.toThrow("503");
    });

    it("should throw when the embed-worker returns an empty embedding array", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [] }),
      } as unknown as Response);

      await expect(
        realModeService.search("any query", "user-real-001", 5),
      ).rejects.toThrow("empty or invalid embedding");
    });

    it("should propagate errors thrown by Qdrant client.search()", async () => {
      qdrantSearchSpy.mockRejectedValue(
        new Error("Qdrant collection not found"),
      );

      await expect(
        realModeService.search("any query", "user-real-001", 5),
      ).rejects.toThrow("Qdrant collection not found");
    });

    it("should map multiple Qdrant points to multiple SearchResult objects", async () => {
      qdrantSearchSpy.mockResolvedValue([
        makeFakeQdrantPoint({}, { id: "p1", score: 0.9 }),
        makeFakeQdrantPoint({}, { id: "p2", score: 0.7 }),
      ]);

      const results = await realModeService.search(
        "query",
        "user-real-001",
        10,
      );

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("p1");
      expect(results[1].id).toBe("p2");
    });
  });
});
