import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const mockWorkflowService = {
  queueUrlIngest: jest.fn(),
  getJobStatus: jest.fn(),
};

const userId = 'user-uuid-001';
const jobId = 'job-uuid-001';

describe('WorkflowController', () => {
  let controller: WorkflowController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [{ provide: WorkflowService, useValue: mockWorkflowService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(WorkflowController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('ingestUrl', () => {
    it('delegates to workflowService.queueUrlIngest with userId from JWT', async () => {
      const dto = { url: 'https://example.com/article', collectionId: null };
      const job = { jobId, status: 'queued', userId };
      mockWorkflowService.queueUrlIngest.mockResolvedValue(job);

      const req = { user: { id: userId } };
      const result = await controller.ingestUrl(dto as any, req);

      expect(result.jobId).toBe(jobId);
      expect(result.status).toBe('queued');
      expect(mockWorkflowService.queueUrlIngest).toHaveBeenCalledWith(dto, userId);
    });
  });

  describe('getJobStatus', () => {
    it('returns job status for a known job ID', async () => {
      mockWorkflowService.getJobStatus.mockResolvedValue({ jobId, status: 'completed' });

      const result = await controller.getJobStatus(jobId);
      expect(result.status).toBe('completed');
      expect(mockWorkflowService.getJobStatus).toHaveBeenCalledWith(jobId);
    });

    it('propagates AppError from service (404 job not found)', async () => {
      mockWorkflowService.getJobStatus.mockRejectedValue(new Error('Not found'));

      await expect(controller.getJobStatus('missing')).rejects.toThrow();
    });
  });
});
