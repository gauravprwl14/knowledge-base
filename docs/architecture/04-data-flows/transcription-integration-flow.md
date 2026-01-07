# Transcription Integration Flow

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The transcription integration flow enables KMS to transcribe audio and video files using the voice-app service. This cross-domain flow uses an integration table and webhooks for loose coupling between services.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      TRANSCRIPTION INTEGRATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────┐
    │  User  │
    └────┬───┘
         │ 1. POST /files/{id}/transcribe
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                            KMS-API                                       │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 1: Validate Request                                          │   │
    │  │                                                                   │   │
    │  │  - Verify file exists and user has access                        │   │
    │  │  - Check file is audio/video type                                │   │
    │  │  - Check no pending transcription exists                         │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 2: Create Integration Link                                   │   │
    │  │                                                                   │   │
    │  │  INSERT INTO kms_transcription_links (file_id, status)           │   │
    │  │  VALUES ($file_id, 'pending')                                    │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 3: Call Voice-App API                                        │   │
    │  │                                                                   │   │
    │  │  POST /api/v1/transcribe                                         │   │
    │  │  {                                                               │   │
    │  │    "file_url": "presigned_download_url",                        │   │
    │  │    "original_filename": "meeting.mp3",                          │   │
    │  │    "webhook_url": "https://kms-api/webhooks/transcription",     │   │
    │  │    "metadata": { "kms_file_id": "uuid" }                        │   │
    │  │  }                                                              │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    └──────────────────────────────┼──────────────────────────────────────────┘
                                   │ 4. HTTP POST
                                   ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                           VOICE-APP                                      │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 4: Create Transcription Job                                  │   │
    │  │                                                                   │   │
    │  │  - Download file from presigned URL                              │   │
    │  │  - Create voice_job record                                       │   │
    │  │  - Queue for processing                                          │   │
    │  │  - Return job_id to KMS                                          │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    └──────────────────────────────┼──────────────────────────────────────────┘
                                   │ 5. Response: { job_id }
                                   ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                            KMS-API                                       │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 5: Update Link with Job ID                                   │   │
    │  │                                                                   │   │
    │  │  UPDATE kms_transcription_links                                  │   │
    │  │  SET voice_job_id = $job_id, status = 'processing'               │   │
    │  │  WHERE file_id = $file_id                                        │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    └──────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                      ASYNC PROCESSING                                    │
    └─────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                           VOICE-APP                                      │
    │                                                                          │
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │                       RabbitMQ                                   │    │
    │  │  ┌─────────────────────────────────────────────────────┐        │    │
    │  │  │               trans.queue                            │        │    │
    │  │  └────────────────────────┬────────────────────────────┘        │    │
    │  └───────────────────────────┼─────────────────────────────────────┘    │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Worker: Process Transcription                                     │   │
    │  │                                                                   │   │
    │  │  1. Convert audio to 16kHz mono WAV                              │   │
    │  │  2. Run Whisper transcription                                    │   │
    │  │  3. Generate segments with timestamps                            │   │
    │  │  4. Store transcription result                                   │   │
    │  │  5. Update job status → 'completed'                              │   │
    │  │  6. Send webhook notification                                    │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    └──────────────────────────────┼──────────────────────────────────────────┘
                                   │ 6. Webhook POST
                                   ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                            KMS-API                                       │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Webhook Handler: /webhooks/transcription                          │   │
    │  │                                                                   │   │
    │  │  Payload:                                                        │   │
    │  │  {                                                               │   │
    │  │    "event": "transcription.completed",                          │   │
    │  │    "job_id": "uuid",                                            │   │
    │  │    "metadata": { "kms_file_id": "uuid" },                       │   │
    │  │    "result": {                                                  │   │
    │  │      "text": "Full transcription...",                           │   │
    │  │      "segments": [...],                                         │   │
    │  │      "language": "en",                                          │   │
    │  │      "confidence": 0.95                                         │   │
    │  │    }                                                            │   │
    │  │  }                                                              │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 7: Update KMS Records                                        │   │
    │  │                                                                   │   │
    │  │  - Update kms_transcription_links.status = 'completed'           │   │
    │  │  - Store transcription text in kms_files.metadata                │   │
    │  │  - Trigger re-embedding with transcription content               │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    └─────────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram

```
User      KMS-API      PostgreSQL      Voice-App      Worker      Webhook
  │          │             │              │             │            │
  │─transcribe─►           │              │             │            │
  │          │──check file─►              │             │            │
  │          │◄─file info──│              │             │            │
  │          │             │              │             │            │
  │          │──create link─►             │             │            │
  │          │             │              │             │            │
  │          │─────────────────POST job──►│             │            │
  │          │◄─────────────────job_id────│             │            │
  │          │             │              │             │            │
  │          │──update link─►             │             │            │
  │          │             │              │             │            │
  │◄─accepted─│             │              │             │            │
  │          │             │              │──queue──────►│            │
  │          │             │              │             │            │
  │          │             │              │   (async)   │            │
  │          │             │              │             │──transcribe │
  │          │             │              │◄─complete───│            │
  │          │             │              │             │            │
  │          │             │              │─────────────────webhook──►│
  │          │             │              │             │            │
  │          │◄────────────────────────────────────────────callback───│
  │          │──update────►│              │             │            │
  │          │             │              │             │            │
```

---

## API Contracts

### KMS → Voice-App Request

**Endpoint**: `POST /api/v1/transcribe`

```json
{
  "file_url": "https://storage.example.com/files/abc123?token=xyz",
  "original_filename": "team_meeting_2026-01-07.mp3",
  "provider": "whisper",
  "model": "base",
  "language": null,
  "options": {
    "word_timestamps": true,
    "detect_language": true
  },
  "webhook_url": "https://kms-api.example.com/api/v1/webhooks/transcription",
  "metadata": {
    "kms_file_id": "550e8400-e29b-41d4-a716-446655440000",
    "kms_user_id": "550e8400-e29b-41d4-a716-446655440001"
  }
}
```

**Response**: `201 Created`

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440010",
  "status": "pending",
  "estimated_duration_seconds": 120,
  "created_at": "2026-01-07T10:00:00Z"
}
```

---

### Voice-App → KMS Webhook

**Endpoint**: `POST /api/v1/webhooks/transcription`

**Success Payload**:

```json
{
  "event": "transcription.completed",
  "timestamp": "2026-01-07T10:02:00Z",
  "job_id": "550e8400-e29b-41d4-a716-446655440010",
  "metadata": {
    "kms_file_id": "550e8400-e29b-41d4-a716-446655440000",
    "kms_user_id": "550e8400-e29b-41d4-a716-446655440001"
  },
  "result": {
    "text": "Welcome everyone to today's meeting. Let's start with the quarterly review...",
    "language": "en",
    "confidence": 0.94,
    "word_count": 1250,
    "duration_seconds": 480,
    "processing_time_ms": 45000,
    "segments": [
      {
        "id": 0,
        "start": 0.0,
        "end": 3.5,
        "text": "Welcome everyone to today's meeting.",
        "confidence": 0.96
      },
      {
        "id": 1,
        "start": 3.5,
        "end": 7.2,
        "text": "Let's start with the quarterly review.",
        "confidence": 0.93
      }
    ]
  }
}
```

**Failure Payload**:

```json
{
  "event": "transcription.failed",
  "timestamp": "2026-01-07T10:02:00Z",
  "job_id": "550e8400-e29b-41d4-a716-446655440010",
  "metadata": {
    "kms_file_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "error": {
    "code": "TRANSCRIPTION_FAILED",
    "message": "Audio file is corrupted or unsupported format",
    "details": {
      "provider": "whisper",
      "model": "base"
    }
  }
}
```

---

## Integration Table

### Schema

```sql
CREATE TABLE kms_transcription_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Soft references (no foreign keys)
    file_id UUID NOT NULL UNIQUE,
    voice_job_id VARCHAR(255),

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,

    -- Cached result
    transcription_text TEXT,
    transcription_language VARCHAR(10),
    transcription_confidence NUMERIC(4, 3),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT chk_status CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    )
);
```

### Status Transitions

```
pending → processing → completed
                    ↘ failed
```

---

## KMS-API Implementation

### Trigger Transcription

```typescript
// files.controller.ts
@Post(':id/transcribe')
async transcribeFile(
  @Param('id') fileId: string,
  @CurrentUser() user: User,
): Promise<TranscriptionResponse> {
  // Step 1: Validate file
  const file = await this.filesService.findOne(fileId, user.id);

  if (!this.isMediaFile(file.mimeType)) {
    throw new BadRequestException('File is not an audio/video file');
  }

  // Step 2: Check for existing transcription
  const existingLink = await this.transcriptionService.findByFileId(fileId);
  if (existingLink?.status === 'processing') {
    throw new ConflictException('Transcription already in progress');
  }

  // Step 3: Create/update link
  const link = await this.transcriptionService.createLink(fileId);

  // Step 4: Generate presigned URL
  const downloadUrl = await this.storageService.getPresignedUrl(
    file.sourceFileId,
    file.sourceType,
  );

  // Step 5: Call voice-app
  const job = await this.voiceAppClient.createJob({
    fileUrl: downloadUrl,
    originalFilename: file.name,
    webhookUrl: `${this.config.baseUrl}/api/v1/webhooks/transcription`,
    metadata: { kms_file_id: fileId, kms_user_id: user.id },
  });

  // Step 6: Update link with job ID
  await this.transcriptionService.updateLink(fileId, {
    voiceJobId: job.jobId,
    status: 'processing',
  });

  return {
    fileId,
    jobId: job.jobId,
    status: 'processing',
    estimatedDuration: job.estimatedDurationSeconds,
  };
}
```

### Webhook Handler

```typescript
// webhooks.controller.ts
@Post('transcription')
async handleTranscriptionWebhook(
  @Body() payload: TranscriptionWebhookPayload,
  @Headers('x-webhook-signature') signature: string,
): Promise<void> {
  // Verify webhook signature
  if (!this.verifySignature(payload, signature)) {
    throw new UnauthorizedException('Invalid webhook signature');
  }

  const fileId = payload.metadata.kms_file_id;

  if (payload.event === 'transcription.completed') {
    // Update link status
    await this.transcriptionService.updateLink(fileId, {
      status: 'completed',
      transcriptionText: payload.result.text,
      transcriptionLanguage: payload.result.language,
      transcriptionConfidence: payload.result.confidence,
      completedAt: new Date(),
    });

    // Update file metadata with transcription
    await this.filesService.updateMetadata(fileId, {
      hasTranscription: true,
      transcriptionWordCount: payload.result.word_count,
      transcriptionLanguage: payload.result.language,
    });

    // Trigger re-embedding with transcription content
    await this.queueService.publish('embed.queue', {
      eventType: 'REPROCESS_WITH_TRANSCRIPTION',
      payload: {
        fileId,
        transcriptionText: payload.result.text,
      },
    });
  } else if (payload.event === 'transcription.failed') {
    await this.transcriptionService.updateLink(fileId, {
      status: 'failed',
      errorMessage: payload.error.message,
    });
  }
}
```

---

## Get Transcription Status

### Endpoint

`GET /api/v1/files/{id}/transcription-status`

### Response

```json
{
  "fileId": "uuid",
  "status": "completed",
  "jobId": "uuid",
  "result": {
    "text": "Full transcription text...",
    "language": "en",
    "confidence": 0.94,
    "wordCount": 1250,
    "segments": [...]
  },
  "createdAt": "2026-01-07T10:00:00Z",
  "completedAt": "2026-01-07T10:02:00Z"
}
```

---

## Supported Media Types

| MIME Type | Extension | Support |
|-----------|-----------|---------|
| `audio/mpeg` | .mp3 | ✅ Full |
| `audio/wav` | .wav | ✅ Full |
| `audio/ogg` | .ogg | ✅ Full |
| `audio/flac` | .flac | ✅ Full |
| `audio/m4a` | .m4a | ✅ Full |
| `video/mp4` | .mp4 | ✅ Full (audio extracted) |
| `video/webm` | .webm | ✅ Full (audio extracted) |
| `video/quicktime` | .mov | ✅ Full (audio extracted) |

---

## Error Handling

### KMS-Side Errors

| Error | HTTP Status | Action |
|-------|-------------|--------|
| File not found | 404 | Return error |
| Not a media file | 400 | Return error |
| Already processing | 409 | Return existing job |
| Voice-app unavailable | 503 | Retry with backoff |

### Voice-App Errors (via Webhook)

| Error Code | Description | KMS Action |
|------------|-------------|------------|
| `TRANSCRIPTION_FAILED` | Processing error | Mark failed, notify user |
| `UNSUPPORTED_FORMAT` | Can't process file | Mark failed |
| `FILE_TOO_LARGE` | Exceeds limit | Mark failed |
| `TIMEOUT` | Processing timeout | Mark failed, allow retry |

---

## Retry Strategy

```typescript
// Voice-app client with retry
async createJob(request: CreateJobRequest): Promise<CreateJobResponse> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.httpClient.post('/api/v1/transcribe', request);
    } catch (error) {
      if (attempt === maxRetries || !this.isRetryable(error)) {
        throw error;
      }

      // Exponential backoff
      await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }
}

isRetryable(error: Error): boolean {
  return (
    error instanceof NetworkError ||
    (error instanceof HttpError && error.status >= 500)
  );
}
```

---

## Re-Embedding with Transcription

When transcription completes, the file content is enhanced with the transcription text:

```python
# embedding-worker handling REPROCESS_WITH_TRANSCRIPTION
async def reprocess_with_transcription(file_id: str, transcription_text: str):
    # Get original file content
    original_content = await get_extracted_content(file_id)

    # Combine original + transcription
    enhanced_content = f"{original_content}\n\n[Transcription]\n{transcription_text}"

    # Re-chunk and re-embed
    chunks = chunker.chunk(enhanced_content)
    embeddings = await generator.generate([c.text for c in chunks])

    # Update Qdrant
    await qdrant.upsert_embeddings(file_id, chunks, embeddings)

    # Update file status
    await db.update_file_embedding_status(file_id, 'completed')
```

This enables semantic search to find audio/video files based on their spoken content.

