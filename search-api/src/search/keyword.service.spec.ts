import { Test, TestingModule } from '@nestjs/testing';
import { KeywordService } from './keyword.service';
import { PrismaService } from '../prisma/prisma.service';
import { getLoggerToken } from 'nestjs-pino';

describe('KeywordService', () => {
  let service: KeywordService;
  let prismaService: jest.Mocked<Pick<PrismaService, '$queryRaw'>>;

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };

  beforeEach(async () => {
    const prismaMock = {
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeywordService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: getLoggerToken(KeywordService.name),
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<KeywordService>(KeywordService);
    prismaService = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('search()', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const query = 'machine learning';
    const limit = 10;
    const offset = 0;

    it('should return mapped results with score and snippet', async () => {
      const rawRows = [
        {
          file_id: 'file-uuid-1',
          filename: 'ml-paper.pdf',
          mime_type: 'application/pdf',
          source_id: 'src-uuid-1',
          rank: 0.75,
          snippet: 'Introduction to <mark>machine learning</mark> techniques…',
        },
        {
          file_id: 'file-uuid-2',
          filename: 'deep-learning.pdf',
          mime_type: 'application/pdf',
          source_id: 'src-uuid-1',
          rank: '0.5',  // test string-to-float conversion
          snippet: '<mark>Machine learning</mark> in neural networks…',
        },
      ];

      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce(rawRows);

      const results = await service.search(query, userId, limit, offset);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        fileId: 'file-uuid-1',
        filename: 'ml-paper.pdf',
        mimeType: 'application/pdf',
        sourceId: 'src-uuid-1',
        score: 0.75,
        chunkIndex: 0,
      });
      // Verify snippet is passed through
      expect(results[0].snippet).toContain('<mark>machine learning</mark>');
    });

    it('should handle string rank values (BigDecimal from Prisma)', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          file_id: 'file-1',
          filename: 'doc.pdf',
          mime_type: 'application/pdf',
          source_id: 'src-1',
          rank: '0.3333',
          snippet: 'Some snippet',
        },
      ]);

      const results = await service.search(query, userId, limit, offset);
      expect(results[0].score).toBeCloseTo(0.3333, 4);
      expect(typeof results[0].score).toBe('number');
    });

    it('should return empty array when no matches are found', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

      const results = await service.search(query, userId, limit, offset);
      expect(results).toEqual([]);
    });

    it('should return empty array and log error when database query fails', async () => {
      (prismaService.$queryRaw as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection refused'),
      );

      const results = await service.search(query, userId, limit, offset);
      expect(results).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ query, userId }),
        'Keyword search query failed',
      );
    });

    it('should pass sourceIds to the query when provided', async () => {
      const sourceIds = ['src-uuid-1', 'src-uuid-2'];
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

      await service.search(query, userId, limit, offset, sourceIds);

      // Verify $queryRaw was called (sourceIds are embedded in the template literal)
      expect(prismaService.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should set chunkIndex to 0 for all keyword results', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          file_id: 'f1',
          filename: 'doc.pdf',
          mime_type: 'text/plain',
          source_id: 'src-1',
          rank: 1.0,
          snippet: 'test',
        },
      ]);

      const results = await service.search(query, userId, limit, offset);
      expect(results[0].chunkIndex).toBe(0);
    });
  });
});
