import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentJobsService } from './content-jobs.service';
import { ContentPiecesService } from './content-pieces.service';
import { ContentChatService } from './content-chat.service';
import { ContentConfigService } from './content-config.service';
import { ContentJobStatus, ContentSourceType } from '@prisma/client';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { CreateContentJobDto } from './dto/create-content-job.dto';
import { UpdateContentPieceDto } from './dto/update-content-piece.dto';
import { GenerateVariationDto } from './dto/generate-variation.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { UpdateContentConfigDto } from './dto/update-content-config.dto';
import { firstValueFrom } from 'rxjs';

// ---------------------------------------------------------------------------
// Factories — build minimal test objects
// ---------------------------------------------------------------------------

/**
 * Builds a minimal fake ContentJobResponseDto.
 */
function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-aaa',
    userId: 'user-111',
    sourceType: ContentSourceType.YOUTUBE,
    sourceUrl: 'https://youtube.com/watch?v=test',
    sourceFileId: null,
    title: null,
    status: ContentJobStatus.QUEUED,
    stepsJson: { 'yt-ingest': 'queued' },
    configSnapshot: {},
    errorMessage: null,
    tags: [],
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    pieces: [],
    ...overrides,
  };
}

/**
 * Builds a minimal fake ContentPiece record.
 */
function makePiece(overrides: Record<string, unknown> = {}) {
  return {
    id: 'piece-bbb',
    jobId: 'job-aaa',
    userId: 'user-111',
    platform: 'linkedin',
    format: 'post',
    variationIndex: 0,
    content: 'Hello LinkedIn!',
    status: 'draft',
    isActive: true,
    version: 1,
    metadata: null,
    editedAt: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Builds a minimal fake ContentConfiguration record.
 */
function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-111',
    userId: 'user-111',
    platformConfig: { linkedin: { enabled: true } },
    voiceMode: 'auto',
    hashnodeApiKeyEncrypted: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Builds a minimal fake CreatorVoiceProfile record.
 */
function makeVoiceProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vp-111',
    userId: 'user-111',
    profileText: 'A'.repeat(150),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Constructs a fake Fastify-style request with an authenticated user. */
function makeReq(userId = 'user-111') {
  return { user: { id: userId } };
}

// ---------------------------------------------------------------------------
// Mock service factories
// ---------------------------------------------------------------------------

function makeJobsServiceMock() {
  return {
    createJob: jest.fn(),
    getJob: jest.fn(),
    listJobs: jest.fn(),
    deleteJob: jest.fn(),
    detectStaleJobs: jest.fn(),
    markJobFailed: jest.fn(),
  };
}

function makePiecesServiceMock() {
  return {
    getPiecesForJob: jest.fn(),
    getPiecesForPlatform: jest.fn(),
    updatePiece: jest.fn(),
    setActiveVariation: jest.fn(),
    generateVariation: jest.fn(),
  };
}

function makeChatServiceMock() {
  return {
    streamChat: jest.fn(),
    getChatHistory: jest.fn(),
  };
}

function makeConfigServiceMock() {
  return {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    getVoiceProfile: jest.fn(),
    upsertVoiceProfile: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ContentController', () => {
  let controller: ContentController;
  let jobsService: ReturnType<typeof makeJobsServiceMock>;
  let piecesService: ReturnType<typeof makePiecesServiceMock>;
  let chatService: ReturnType<typeof makeChatServiceMock>;
  let configService: ReturnType<typeof makeConfigServiceMock>;
  // Holds the compiled TestingModule — created once in beforeAll and closed in afterAll.
  let module: TestingModule;

  // Create service mocks once; individual mock functions are reset via
  // jest.clearAllMocks() in beforeEach so call counts don't bleed between tests.
  beforeAll(async () => {
    jobsService = makeJobsServiceMock();
    piecesService = makePiecesServiceMock();
    chatService = makeChatServiceMock();
    configService = makeConfigServiceMock();

    module = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        { provide: ContentJobsService, useValue: jobsService },
        { provide: ContentPiecesService, useValue: piecesService },
        { provide: ContentChatService, useValue: chatService },
        { provide: ContentConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get<ContentController>(ContentController);
  });

  // Release module resources after all tests complete.
  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    // Clear mock call counts and return values between tests so each test
    // starts with a clean slate. Return values are set inline within each `it`.
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /content/jobs
  // -------------------------------------------------------------------------

  describe('POST /jobs — createJob', () => {
    it('calls createJob with dto and userId from req.user.id', async () => {
      const dto: CreateContentJobDto = {
        sourceType: ContentSourceType.YOUTUBE,
        sourceUrl: 'https://youtube.com/watch?v=test',
      };
      const job = makeJob();
      jobsService.createJob.mockResolvedValue(job);

      const result = await controller.createJob(dto, makeReq());

      expect(jobsService.createJob).toHaveBeenCalledWith(dto, 'user-111');
      expect(result).toEqual(job);
    });

    it('returns the created job from the service', async () => {
      const dto: CreateContentJobDto = { sourceType: ContentSourceType.URL, sourceUrl: 'https://example.com' };
      const job = makeJob({ id: 'new-job', status: ContentJobStatus.QUEUED });
      jobsService.createJob.mockResolvedValue(job);

      const result = await controller.createJob(dto, makeReq());

      expect(result.id).toBe('new-job');
      expect(result.status).toBe(ContentJobStatus.QUEUED);
    });

    it('propagates AppError from service without wrapping', async () => {
      const dto: CreateContentJobDto = { sourceType: ContentSourceType.YOUTUBE, sourceUrl: 'https://yt.com/v=x' };
      const error = new AppError({ code: ERROR_CODES.CNT.QUEUE_PUBLISH_FAILED.code });
      jobsService.createJob.mockRejectedValue(error);

      await expect(controller.createJob(dto, makeReq())).rejects.toThrow(error);
    });
  });

  // -------------------------------------------------------------------------
  // GET /content/jobs
  // -------------------------------------------------------------------------

  describe('GET /jobs — listJobs', () => {
    it('calls listJobs with query and userId', async () => {
      const query = { limit: 10 };
      const page = { items: [makeJob()], total: 1, nextCursor: null };
      jobsService.listJobs.mockResolvedValue(page);

      const result = await controller.listJobs(query as any, makeReq());

      expect(jobsService.listJobs).toHaveBeenCalledWith(query, 'user-111');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('returns paginated list from the service', async () => {
      const page = { items: [makeJob(), makeJob({ id: 'job-bbb' })], total: 2, nextCursor: 'abc123' };
      jobsService.listJobs.mockResolvedValue(page);

      const result = await controller.listJobs({} as any, makeReq());

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('abc123');
    });
  });

  // -------------------------------------------------------------------------
  // GET /content/jobs/:id
  // -------------------------------------------------------------------------

  describe('GET /jobs/:id — getJob', () => {
    it('calls getJob with jobId and userId', async () => {
      const job = makeJob();
      jobsService.getJob.mockResolvedValue(job);

      const result = await controller.getJob('job-aaa', makeReq());

      expect(jobsService.getJob).toHaveBeenCalledWith('job-aaa', 'user-111');
      expect(result).toEqual(job);
    });

    it('returns the job with stepsJson and pieces', async () => {
      const job = makeJob({ stepsJson: { 'yt-ingest': 'done' }, pieces: [makePiece()] });
      jobsService.getJob.mockResolvedValue(job);

      const result = await controller.getJob('job-aaa', makeReq());

      expect(result.stepsJson).toEqual({ 'yt-ingest': 'done' });
      expect(result.pieces).toHaveLength(1);
    });

    it('propagates ForbiddenException from service for IDOR', async () => {
      jobsService.getJob.mockRejectedValue(new ForbiddenException('Forbidden'));

      await expect(controller.getJob('job-aaa', makeReq('other-user'))).rejects.toThrow(ForbiddenException);
    });

    it('propagates AppError (404) from service when job missing', async () => {
      jobsService.getJob.mockRejectedValue(new AppError({ code: ERROR_CODES.CNT.JOB_NOT_FOUND.code }));

      await expect(controller.getJob('nonexistent', makeReq())).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /content/jobs/:id
  // -------------------------------------------------------------------------

  describe('DELETE /jobs/:id — deleteJob', () => {
    it('calls deleteJob with jobId and userId', async () => {
      jobsService.deleteJob.mockResolvedValue(undefined);

      await controller.deleteJob('job-aaa', makeReq());

      expect(jobsService.deleteJob).toHaveBeenCalledWith('job-aaa', 'user-111');
    });

    it('returns void on success', async () => {
      jobsService.deleteJob.mockResolvedValue(undefined);

      const result = await controller.deleteJob('job-aaa', makeReq());

      expect(result).toBeUndefined();
    });

    it('propagates ForbiddenException for cross-user deletion', async () => {
      jobsService.deleteJob.mockRejectedValue(new ForbiddenException('Forbidden'));

      await expect(controller.deleteJob('job-aaa', makeReq('evil-user'))).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // GET /content/jobs/:id/pieces
  // -------------------------------------------------------------------------

  describe('GET /jobs/:id/pieces — listPieces', () => {
    it('calls getPiecesForJob with jobId and userId', async () => {
      piecesService.getPiecesForJob.mockResolvedValue([makePiece()]);

      const result = await controller.listPieces('job-aaa', makeReq());

      expect(piecesService.getPiecesForJob).toHaveBeenCalledWith('job-aaa', 'user-111');
      expect(result).toHaveLength(1);
    });

    it('returns 403 for another users job (IDOR)', async () => {
      piecesService.getPiecesForJob.mockRejectedValue(new ForbiddenException('Forbidden'));

      await expect(controller.listPieces('job-aaa', makeReq('evil-user'))).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /content/jobs/:id/pieces/:pieceId
  // -------------------------------------------------------------------------

  describe('PUT /jobs/:id/pieces/:pieceId — updatePiece', () => {
    it('calls updatePiece with pieceId, dto, and userId', async () => {
      const dto: UpdateContentPieceDto = { content: 'Updated content', version: 1 };
      const updated = makePiece({ content: 'Updated content', version: 2 });
      piecesService.updatePiece.mockResolvedValue(updated);

      const result = await controller.updatePiece('job-aaa', 'piece-bbb', dto, makeReq());

      // Controller passes pieceId, dto, and userId — jobId (_id) is intentionally not forwarded
      expect(piecesService.updatePiece).toHaveBeenCalledWith('piece-bbb', dto, 'user-111');
      expect(result).toEqual(updated);
    });

    it('passes through 409 ConflictException on version mismatch', async () => {
      const dto: UpdateContentPieceDto = { content: 'Content', version: 1 };
      piecesService.updatePiece.mockRejectedValue(
        new ConflictException('Version conflict: expected version 2, got 1'),
      );

      await expect(
        controller.updatePiece('job-aaa', 'piece-bbb', dto, makeReq()),
      ).rejects.toThrow(ConflictException);
    });

    it('propagates ForbiddenException for cross-user access', async () => {
      const dto: UpdateContentPieceDto = { content: 'x', version: 1 };
      piecesService.updatePiece.mockRejectedValue(new ForbiddenException('Forbidden'));

      await expect(
        controller.updatePiece('job-aaa', 'piece-bbb', dto, makeReq('evil-user')),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /content/jobs/:id/pieces/:pieceId/activate
  // -------------------------------------------------------------------------

  describe('PATCH /jobs/:id/pieces/:pieceId/activate — setActiveVariation', () => {
    it('calls setActiveVariation with pieceId, jobId, and userId', async () => {
      piecesService.setActiveVariation.mockResolvedValue(undefined);
      piecesService.getPiecesForJob.mockResolvedValue([makePiece({ isActive: true })]);

      await controller.setActiveVariation('job-aaa', 'piece-bbb', makeReq());

      expect(piecesService.setActiveVariation).toHaveBeenCalledWith('piece-bbb', 'job-aaa', 'user-111');
    });

    it('returns 200 with updated pieces list', async () => {
      const activePiece = makePiece({ isActive: true });
      piecesService.setActiveVariation.mockResolvedValue(undefined);
      piecesService.getPiecesForJob.mockResolvedValue([activePiece]);

      const result = await controller.setActiveVariation('job-aaa', 'piece-bbb', makeReq());

      expect(result).toHaveProperty('pieces');
      expect(result.pieces).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // POST /content/jobs/:id/pieces/:platform/generate
  // -------------------------------------------------------------------------

  describe('POST /jobs/:id/pieces/:platform/generate — generateVariation', () => {
    it('calls generateVariation and returns accepted: true', async () => {
      piecesService.generateVariation.mockResolvedValue(undefined);
      const dto: GenerateVariationDto = { instruction: 'More concise' };

      const result = await controller.generateVariation('job-aaa', 'linkedin', dto, makeReq());

      expect(piecesService.generateVariation).toHaveBeenCalledWith(
        'job-aaa', 'linkedin', dto, 'user-111',
      );
      expect(result).toEqual({ accepted: true });
    });

    it('propagates AppError when variation limit exceeded (KBCNT0009)', async () => {
      piecesService.generateVariation.mockRejectedValue(
        new AppError({ code: ERROR_CODES.CNT.VARIATION_FAILED.code }),
      );

      await expect(
        controller.generateVariation('job-aaa', 'linkedin', {}, makeReq()),
      ).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // POST /content/jobs/:id/pieces/:platform/retry
  // -------------------------------------------------------------------------

  describe('POST /jobs/:id/pieces/:platform/retry — retryPlatform', () => {
    it('calls generateVariation with empty dto (no instruction) and returns accepted: true', async () => {
      piecesService.generateVariation.mockResolvedValue(undefined);

      const result = await controller.retryPlatform('job-aaa', 'linkedin', makeReq());

      expect(piecesService.generateVariation).toHaveBeenCalledWith(
        'job-aaa', 'linkedin', {}, 'user-111',
      );
      expect(result).toEqual({ accepted: true });
    });
  });

  // -------------------------------------------------------------------------
  // GET /content/jobs/:id/chat
  // -------------------------------------------------------------------------

  describe('GET /jobs/:id/chat — getChatHistory', () => {
    it('calls getChatHistory with jobId, null pieceId, and userId', async () => {
      const messages = [
        { id: 'msg-1', jobId: 'job-aaa', pieceId: null, role: 'user', content: 'Hello' },
      ];
      chatService.getChatHistory.mockResolvedValue(messages);

      const result = await controller.getChatHistory('job-aaa', makeReq());

      expect(chatService.getChatHistory).toHaveBeenCalledWith('job-aaa', null, 'user-111');
      expect(result).toEqual(messages);
    });

    it('returns messages array in chronological order', async () => {
      const messages = [
        { id: 'msg-1', role: 'user', content: 'First' },
        { id: 'msg-2', role: 'assistant', content: 'Response' },
      ];
      chatService.getChatHistory.mockResolvedValue(messages);

      const result = await controller.getChatHistory('job-aaa', makeReq());

      expect(result).toHaveLength(2);
      expect((result[0] as any).role).toBe('user');
    });
  });

  // -------------------------------------------------------------------------
  // GET /content/jobs/:id/chat/:pieceId
  // -------------------------------------------------------------------------

  describe('GET /jobs/:id/chat/:pieceId — getPieceChatHistory', () => {
    it('calls getChatHistory with jobId, pieceId, and userId', async () => {
      chatService.getChatHistory.mockResolvedValue([]);

      await controller.getPieceChatHistory('job-aaa', 'piece-bbb', makeReq());

      expect(chatService.getChatHistory).toHaveBeenCalledWith('job-aaa', 'piece-bbb', 'user-111');
    });
  });

  // -------------------------------------------------------------------------
  // POST /content/jobs/:id/chat (sendChatMessage) — manual SSE via @Res()
  // -------------------------------------------------------------------------

  describe('POST /jobs/:id/chat — sendChatMessage', () => {
    it('streams SSE chunks via raw response for sendChatMessage', async () => {
      // Service yields plain text strings — controller wraps each as "data: <chunk>\n\n"
      async function* fakeGen() {
        yield 'Hello';
        yield 'World';
        yield '[DONE]';
      }
      chatService.streamChat.mockReturnValue(fakeGen());

      const dto: SendChatMessageDto = { message: 'Improve this post' };

      // Mock a Fastify-style raw HTTP response to capture SSE writes
      const writes: string[] = [];
      const mockRes = {
        raw: {
          writeHead: jest.fn(),
          write: jest.fn((chunk: string) => writes.push(chunk)),
          end: jest.fn(),
        },
      };

      await controller.sendChatMessage('job-aaa', dto, makeReq(), mockRes as any);

      expect(chatService.streamChat).toHaveBeenCalledWith('job-aaa', null, 'Improve this post', 'user-111');
      // SSE headers must be written before any body
      expect(mockRes.raw.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'X-Accel-Buffering': 'no',
      }));
      // Each chunk must be framed as "data: <text>\n\n"
      expect(writes).toContain('data: Hello\n\n');
      expect(writes).toContain('data: [DONE]\n\n');
      // Response must be terminated
      expect(mockRes.raw.end).toHaveBeenCalled();
    });

    it('writes an error SSE frame on streamChat failure', async () => {
      // Simulate a generator that throws
      async function* failingGen() {
        yield 'partial';
        throw new Error('Claude API error');
      }
      chatService.streamChat.mockReturnValue(failingGen());

      const dto: SendChatMessageDto = { message: 'Fail me' };
      const writes: string[] = [];
      const mockRes = {
        raw: {
          writeHead: jest.fn(),
          write: jest.fn((chunk: string) => writes.push(chunk)),
          end: jest.fn(),
        },
      };

      // Should not throw — errors are written to the stream, not re-thrown
      await controller.sendChatMessage('job-aaa', dto, makeReq(), mockRes as any);

      expect(writes).toContain('data: partial\n\n');
      // Error frame must be present
      expect(writes.some((w) => w.startsWith('data: [ERROR]'))).toBe(true);
      expect(mockRes.raw.end).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /content/jobs/:id/chat/:pieceId (sendPieceChatMessage) — manual SSE
  // -------------------------------------------------------------------------

  describe('POST /jobs/:id/chat/:pieceId — sendPieceChatMessage', () => {
    it('streams SSE chunks via raw response with pieceId scoping', async () => {
      // Service yields plain text — no SSE formatting from the service layer
      async function* fakeGen() {
        yield 'chunk';
        yield '[DONE]';
      }
      chatService.streamChat.mockReturnValue(fakeGen());

      const dto: SendChatMessageDto = { message: 'Shorten this' };
      const writes: string[] = [];
      const mockRes = {
        raw: {
          writeHead: jest.fn(),
          write: jest.fn((chunk: string) => writes.push(chunk)),
          end: jest.fn(),
        },
      };

      await controller.sendPieceChatMessage('job-aaa', 'piece-bbb', dto, makeReq(), mockRes as any);

      // Service must be called with the correct pieceId
      expect(chatService.streamChat).toHaveBeenCalledWith('job-aaa', 'piece-bbb', 'Shorten this', 'user-111');
      // SSE headers must include text/event-stream
      expect(mockRes.raw.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
      }));
      expect(writes).toContain('data: chunk\n\n');
      expect(writes).toContain('data: [DONE]\n\n');
      expect(mockRes.raw.end).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /content/config
  // -------------------------------------------------------------------------

  describe('GET /config — getConfig', () => {
    it('calls getConfig with userId', async () => {
      const config = makeConfig();
      configService.getConfig.mockResolvedValue(config);

      const result = await controller.getConfig(makeReq());

      expect(configService.getConfig).toHaveBeenCalledWith('user-111');
      expect(result).toEqual(config);
    });

    it('returns config object with platformConfig and voiceMode', async () => {
      const config = makeConfig({ voiceMode: 'interactive' });
      configService.getConfig.mockResolvedValue(config);

      const result = await controller.getConfig(makeReq()) as any;

      expect(result.voiceMode).toBe('interactive');
      expect(result.platformConfig).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // PUT /content/config
  // -------------------------------------------------------------------------

  describe('PUT /config — updateConfig', () => {
    it('calls updateConfig with userId and dto', async () => {
      const dto: UpdateContentConfigDto = { voiceMode: 'disabled' };
      const config = makeConfig({ voiceMode: 'disabled' });
      configService.updateConfig.mockResolvedValue(config);

      const result = await controller.updateConfig(dto, makeReq());

      expect(configService.updateConfig).toHaveBeenCalledWith('user-111', dto);
      expect(result).toEqual(config);
    });
  });

  // -------------------------------------------------------------------------
  // GET /content/voice
  // -------------------------------------------------------------------------

  describe('GET /voice — getVoiceProfile', () => {
    it('calls getVoiceProfile with userId', async () => {
      const profile = makeVoiceProfile();
      configService.getVoiceProfile.mockResolvedValue(profile);

      const result = await controller.getVoiceProfile(makeReq());

      expect(configService.getVoiceProfile).toHaveBeenCalledWith('user-111');
      expect(result).toEqual(profile);
    });

    it('throws NotFoundException when profile is null', async () => {
      configService.getVoiceProfile.mockResolvedValue(null);

      await expect(controller.getVoiceProfile(makeReq())).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /content/voice
  // -------------------------------------------------------------------------

  describe('PUT /voice — upsertVoiceProfile', () => {
    it('calls upsertVoiceProfile with userId and profileText', async () => {
      const profileText = 'A'.repeat(150);
      const profile = makeVoiceProfile({ profileText });
      configService.upsertVoiceProfile.mockResolvedValue(profile);

      const result = await controller.upsertVoiceProfile({ profileText }, makeReq());

      expect(configService.upsertVoiceProfile).toHaveBeenCalledWith('user-111', profileText);
      expect(result).toEqual(profile);
    });

    it('propagates AppError when profileText is too short (KBCNT0007)', async () => {
      configService.upsertVoiceProfile.mockRejectedValue(
        new AppError({ code: ERROR_CODES.CNT.VOICE_PROFILE_NOT_SET.code }),
      );

      await expect(
        controller.upsertVoiceProfile({ profileText: 'too short' }, makeReq()),
      ).rejects.toThrow(AppError);
    });

    it('does not throw when profileText is exactly 100 chars', async () => {
      const profileText = 'A'.repeat(100);
      const profile = makeVoiceProfile({ profileText });
      configService.upsertVoiceProfile.mockResolvedValue(profile);

      const result = await controller.upsertVoiceProfile({ profileText }, makeReq());

      expect(result).toEqual(profile);
    });
  });

  // -------------------------------------------------------------------------
  // SSE: GET /content/jobs/:id/status — streamJobStatus
  // -------------------------------------------------------------------------

  describe('SSE: GET /jobs/:id/status — streamJobStatus (basic)', () => {
    it('emits a MessageEvent with status and stepsJson on first tick', async () => {
      // Return a DONE job so the stream completes quickly in tests
      const doneJob = makeJob({ status: ContentJobStatus.DONE, stepsJson: { 'yt-ingest': 'done' } });
      jobsService.getJob.mockResolvedValue(doneJob);

      const observable = controller.streamJobStatus('job-aaa', makeReq());

      // The first emitted event should carry the job data
      const firstEvent = await firstValueFrom(observable);
      const parsed = JSON.parse((firstEvent as any).data as string);

      expect(parsed.status).toBe(ContentJobStatus.DONE);
      expect(parsed.steps).toEqual({ 'yt-ingest': 'done' });
    });

    it('passes jobId and userId to getJob', async () => {
      const doneJob = makeJob({ status: ContentJobStatus.DONE });
      jobsService.getJob.mockResolvedValue(doneJob);

      await firstValueFrom(controller.streamJobStatus('job-aaa', makeReq()));

      expect(jobsService.getJob).toHaveBeenCalledWith('job-aaa', 'user-111');
    });
  });
});
