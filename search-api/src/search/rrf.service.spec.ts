import { Test, TestingModule } from "@nestjs/testing";
import { RrfService } from "./rrf.service";
import { SearchResult } from "./dto/search-response.dto";
import { getLoggerToken } from "nestjs-pino";

/** Helper to build a minimal SearchResult. */
function makeResult(id: string, score = 1.0): SearchResult {
  return {
    id,
    fileId: `file-${id}`,
    filename: `${id}.pdf`,
    content: `Content for ${id}`,
    score,
    chunkIndex: 0,
    metadata: {},
  };
}

describe("RrfService", () => {
  let service: RrfService;

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RrfService,
        {
          provide: getLoggerToken(RrfService.name),
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<RrfService>(RrfService);
    jest.clearAllMocks();
  });

  describe("fuse()", () => {
    it("should return an empty array when all input lists are empty", () => {
      const result = service.fuse([[], []], 10);
      expect(result).toEqual([]);
    });

    it("should return items from a single non-empty list", () => {
      const list = [makeResult("chunk-1"), makeResult("chunk-2")];
      const result = service.fuse([list], 10);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("chunk-1");
      expect(result.map((r) => r.id)).toContain("chunk-2");
    });

    it("should return items from the keyword list when semantic list is empty", () => {
      const keyword = [makeResult("chunk-1"), makeResult("chunk-2")];
      const result = service.fuse([keyword, []], 10);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("chunk-1");
      expect(result.map((r) => r.id)).toContain("chunk-2");
    });

    it("should return items from the semantic list when keyword list is empty", () => {
      const semantic = [makeResult("chunk-3"), makeResult("chunk-4")];
      const result = service.fuse([[], semantic], 10);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("chunk-3");
      expect(result.map((r) => r.id)).toContain("chunk-4");
    });

    it("should return all items when lists are disjoint", () => {
      const keyword = [makeResult("chunk-1"), makeResult("chunk-2")];
      const semantic = [makeResult("chunk-3"), makeResult("chunk-4")];
      const result = service.fuse([keyword, semantic], 10);
      expect(result).toHaveLength(4);
    });

    it("should deduplicate items that appear in multiple lists", () => {
      const shared = makeResult("chunk-shared");
      const keyword = [shared, makeResult("chunk-k-only")];
      const semantic = [shared, makeResult("chunk-s-only")];
      const result = service.fuse([keyword, semantic], 10);
      // 3 unique chunks, not 4
      expect(result).toHaveLength(3);
      expect(result.filter((r) => r.id === "chunk-shared")).toHaveLength(1);
    });

    it("should score an item appearing in both lists higher than one in a single list", () => {
      const shared = makeResult("chunk-shared");
      const keyword = [shared, makeResult("chunk-k")];
      const semantic = [shared, makeResult("chunk-s")];
      const result = service.fuse([keyword, semantic], 10);

      const sharedResult = result.find((r) => r.id === "chunk-shared")!;
      const keywordOnly = result.find((r) => r.id === "chunk-k")!;
      const semanticOnly = result.find((r) => r.id === "chunk-s")!;

      expect(sharedResult.score).toBeGreaterThan(keywordOnly.score);
      expect(sharedResult.score).toBeGreaterThan(semanticOnly.score);
    });

    it("should order results by RRF score descending", () => {
      // chunk-top is rank-1 in keyword and also appears in semantic
      const keyword = [makeResult("chunk-top"), makeResult("chunk-mid")];
      const semantic = [makeResult("chunk-top")];
      const result = service.fuse([keyword, semantic], 10);
      // chunk-top appears in both lists → highest combined score
      expect(result[0].id).toBe("chunk-top");
    });

    it("should honour the limit parameter", () => {
      const keyword = [makeResult("c1"), makeResult("c2"), makeResult("c3")];
      const semantic = [makeResult("c4"), makeResult("c5")];
      const result = service.fuse([keyword, semantic], 2);
      expect(result).toHaveLength(2);
    });

    it("should preserve chunk metadata in the fused output", () => {
      const item: SearchResult = {
        ...makeResult("chunk-meta"),
        filename: "special.docx",
        metadata: { topic: "rag" },
      };
      const result = service.fuse([[item], []], 10);
      const found = result.find((r) => r.id === "chunk-meta")!;
      expect(found.filename).toBe("special.docx");
      expect(found.metadata).toEqual({ topic: "rag" });
    });
  });
});
