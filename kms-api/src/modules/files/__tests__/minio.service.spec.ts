/**
 * Unit tests for MinioService
 *
 * Coverage:
 * - getPresignedUrl returns a URL string
 * - getTranscriptText reads stream and returns UTF-8 string
 * - uploadTranscript puts an object and returns the correct key
 * - ensureBucket is idempotent (called once even for multiple operations)
 * - ensureBucket creates the bucket when it does not exist
 * - getPresignedUrl propagates MinIO client errors
 * - getTranscriptText propagates MinIO client errors
 */
import { MinioService } from '../minio.service';
import { AppLogger } from '../../../logger/logger.service';
import { Readable } from 'stream';

// ---------------------------------------------------------------------------
// Mock the minio package before importing MinioService
// ---------------------------------------------------------------------------
const mockPresignedGetObject = jest.fn();
const mockGetObject = jest.fn();
const mockPutObject = jest.fn();
const mockBucketExists = jest.fn();
const mockMakeBucket = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    presignedGetObject: mockPresignedGetObject,
    getObject: mockGetObject,
    putObject: mockPutObject,
    bucketExists: mockBucketExists,
    makeBucket: mockMakeBucket,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReadableStream(content: string): Readable {
  const stream = new Readable({ read() {} });
  stream.push(Buffer.from(content, 'utf-8'));
  stream.push(null);
  return stream;
}

function makeService(): MinioService {
  const logger = {
    child: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as AppLogger;

  return new MinioService(logger);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MinioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: bucket already exists
    mockBucketExists.mockResolvedValue(true);
  });

  // -------------------------------------------------------------------------
  // getPresignedUrl
  // -------------------------------------------------------------------------

  describe('getPresignedUrl', () => {
    it('returns the URL string from the minio client', async () => {
      const expectedUrl = 'http://localhost:9000/kms-transcripts/transcripts/u1/j1.txt?X-Amz-Signature=abc';
      mockPresignedGetObject.mockResolvedValue(expectedUrl);

      const svc = makeService();
      const url = await svc.getPresignedUrl('transcripts/u1/j1.txt');

      expect(url).toBe(expectedUrl);
      expect(mockPresignedGetObject).toHaveBeenCalledWith(
        expect.any(String), // bucket
        'transcripts/u1/j1.txt',
        900, // 15-min TTL
      );
    });

    it('propagates errors from the minio client', async () => {
      mockPresignedGetObject.mockRejectedValue(new Error('connection refused'));

      const svc = makeService();
      await expect(svc.getPresignedUrl('transcripts/u1/j1.txt')).rejects.toThrow('connection refused');
    });
  });

  // -------------------------------------------------------------------------
  // getTranscriptText
  // -------------------------------------------------------------------------

  describe('getTranscriptText', () => {
    it('reads the stream and returns UTF-8 text', async () => {
      const expectedText = 'Hello world transcript';
      mockGetObject.mockResolvedValue(makeReadableStream(expectedText));

      const svc = makeService();
      const text = await svc.getTranscriptText('transcripts/u1/j1.txt');

      expect(text).toBe(expectedText);
      expect(mockGetObject).toHaveBeenCalledWith(expect.any(String), 'transcripts/u1/j1.txt');
    });

    it('propagates errors from the minio client', async () => {
      mockGetObject.mockRejectedValue(new Error('NoSuchKey'));

      const svc = makeService();
      await expect(svc.getTranscriptText('transcripts/u1/missing.txt')).rejects.toThrow('NoSuchKey');
    });
  });

  // -------------------------------------------------------------------------
  // uploadTranscript
  // -------------------------------------------------------------------------

  describe('uploadTranscript', () => {
    it('calls putObject and returns the correct object key', async () => {
      mockPutObject.mockResolvedValue(undefined);

      const svc = makeService();
      const key = await svc.uploadTranscript('job-123', 'user-456', 'transcript text');

      expect(key).toBe('transcripts/user-456/job-123.txt');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.any(String), // bucket
        'transcripts/user-456/job-123.txt',
        expect.any(Buffer),
        expect.any(Number),
        { 'Content-Type': 'text/plain; charset=utf-8' },
      );
    });
  });

  // -------------------------------------------------------------------------
  // ensureBucket (idempotency)
  // -------------------------------------------------------------------------

  describe('ensureBucket idempotency', () => {
    it('calls bucketExists only once across multiple operations', async () => {
      mockPresignedGetObject.mockResolvedValue('http://example.com/url');
      const expectedText = 'hi';
      mockGetObject.mockResolvedValue(makeReadableStream(expectedText));

      const svc = makeService();
      await svc.getPresignedUrl('k1');
      await svc.getPresignedUrl('k2');
      await svc.getTranscriptText('k3');

      expect(mockBucketExists).toHaveBeenCalledTimes(1);
    });

    it('creates the bucket when it does not exist', async () => {
      mockBucketExists.mockResolvedValue(false);
      mockMakeBucket.mockResolvedValue(undefined);
      mockPresignedGetObject.mockResolvedValue('http://example.com/url');

      const svc = makeService();
      await svc.getPresignedUrl('transcripts/u/j.txt');

      expect(mockMakeBucket).toHaveBeenCalledTimes(1);
    });
  });
});
