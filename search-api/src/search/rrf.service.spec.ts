import { Test, TestingModule } from '@nestjs/testing';
import { RrfService } from './rrf.service';
import { SearchResultItemDto } from './dto/search-result.dto';
import { getLoggerToken } from 'nestjs-pino';

/** Helper to build a minimal SearchResultItemDto. */
function makeItem(fileId: string, score = 1.0): SearchResultItemDto {
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

describe('RrfService', () => {
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

  describe('merge()', () => {
    it('should return an empty array when both lists are empty', () => {
      const result = service.merge([], []);
      expect(result).toEqual([]);
    });

    it('should return all items from keyword list when semantic list is empty', () => {
      const keyword = [makeItem('file-1'), makeItem('file-2')];
      const result = service.merge(keyword, []);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.fileId)).toContain('file-1');
      expect(result.map((r) => r.fileId)).toContain('file-2');
    });

    it('should return all items from semantic list when keyword list is empty', () => {
      const semantic = [makeItem('file-3'), makeItem('file-4')];
      const result = service.merge([], semantic);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.fileId)).toContain('file-3');
      expect(result.map((r) => r.fileId)).toContain('file-4');
    });

    it('should return all items when lists are disjoint', () => {
      const keyword = [makeItem('file-1'), makeItem('file-2')];
      const semantic = [makeItem('file-3'), makeItem('file-4')];
      const result = service.merge(keyword, semantic);
      expect(result).toHaveLength(4);
      const ids = result.map((r) => r.fileId);
      expect(ids).toContain('file-1');
      expect(ids).toContain('file-2');
      expect(ids).toContain('file-3');
      expect(ids).toContain('file-4');
    });

    it('should deduplicate items that appear in both lists', () => {
      const shared = 'file-shared';
      const keyword = [makeItem(shared), makeItem('file-k-only')];
      const semantic = [makeItem(shared), makeItem('file-s-only')];
      const result = service.merge(keyword, semantic);
      // 3 unique items, not 4
      expect(result).toHaveLength(3);
      const ids = result.map((r) => r.fileId);
      expect(ids.filter((id) => id === shared)).toHaveLength(1);
    });

    it('should score an item appearing in both lists higher than one in a single list', () => {
      const shared = 'file-shared';
      const keyword = [makeItem(shared), makeItem('file-k')];
      const semantic = [makeItem(shared), makeItem('file-s')];
      const result = service.merge(keyword, semantic);

      const sharedResult = result.find((r) => r.fileId === shared)!;
      const keywordOnly = result.find((r) => r.fileId === 'file-k')!;
      const semanticOnly = result.find((r) => r.fileId === 'file-s')!;

      expect(sharedResult.score).toBeGreaterThan(keywordOnly.score);
      expect(sharedResult.score).toBeGreaterThan(semanticOnly.score);
    });

    it('should order results by combined RRF score descending', () => {
      // file-top is rank-1 in keyword; file-mid is rank-2 in keyword only
      const keyword = [makeItem('file-top'), makeItem('file-mid')];
      const semantic = [makeItem('file-top')];
      const result = service.merge(keyword, semantic);

      // file-top appears in both lists → highest score
      expect(result[0].fileId).toBe('file-top');
    });

    it('should use the RRF formula: score = sum of 1/(k + rank)', () => {
      const k = 60;
      const keyword = [makeItem('file-a'), makeItem('file-b')]; // ranks 1, 2
      const result = service.merge(keyword, [], k);

      const scoreA = result.find((r) => r.fileId === 'file-a')!.score;
      const scoreB = result.find((r) => r.fileId === 'file-b')!.score;

      // file-a: 1/(60+1) ≈ 0.01639
      // file-b: 1/(60+2) ≈ 0.01613
      expect(scoreA).toBeCloseTo(1 / (k + 1), 5);
      expect(scoreB).toBeCloseTo(1 / (k + 2), 5);
      expect(scoreA).toBeGreaterThan(scoreB);
    });

    it('should preserve item metadata in the merged output', () => {
      const item = {
        ...makeItem('file-meta'),
        filename: 'special.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sourceId: 'src-special',
      };
      const result = service.merge([item], []);
      const found = result.find((r) => r.fileId === 'file-meta')!;
      expect(found.filename).toBe('special.docx');
      expect(found.sourceId).toBe('src-special');
    });
  });
});
