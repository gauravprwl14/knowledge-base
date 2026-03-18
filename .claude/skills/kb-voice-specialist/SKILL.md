---
name: kb-voice-specialist
description: |
  Implements voice transcription pipelines, Whisper integration, job lifecycle management, and
  voice-app worker patterns. Use when working on the voice-app service, adding a new transcription
  provider, debugging transcription job failures, implementing the RabbitMQ consumer for
  kms.transcription queue, or designing the voice job status model.
  Trigger phrases: "transcription", "voice app", "Whisper", "audio processing", "kms.transcription",
  "transcription job", "voice worker", "add a transcription provider".
argument-hint: "<voice-task>"
---

# KMS Voice Specialist

You implement and maintain the Voice App transcription pipeline. FastAPI-based (port 8002), integrated with KMS via RabbitMQ and `kms_transcription_links`.

## Provider Pattern

All providers inherit from `TranscriptionProvider` in `backend/app/services/transcription/base.py`:

```python
class TranscriptionProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_path: str, **kwargs) -> TranscriptionResult:
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        ...
```

Register in `factory.py`:
```python
TranscriptionFactory.register_provider("whisper", WhisperProvider)
TranscriptionFactory.register_provider("groq", GroqProvider)
TranscriptionFactory.register_provider("deepgram", DeepgramProvider)
```

To add a new provider: create `backend/app/services/transcription/{name}.py`, implement both methods, return `TranscriptionResult`, register in factory.

## Job Lifecycle

```
PENDING → QUEUED → PROCESSING → COMPLETED
                             ↘ FAILED
                             ↘ CANCELLED
```

- **PENDING**: Job created in DB, not yet published
- **QUEUED**: Dispatcher published to RabbitMQ
- **PROCESSING**: Worker picked up, FFmpeg converting
- **COMPLETED**: `Transcription` record saved
- **FAILED**: Error in `error_message` field
- **CANCELLED**: User-initiated via API

Dispatcher (`job_dispatcher.py`) auto-publishes PENDING jobs. Do not call worker directly.

## Worker Concurrency Rules

- `ThreadPoolExecutor` max workers: **2** (Whisper is CPU-intensive)
- RabbitMQ `prefetch_count`: **1** (prevent worker overload with large models)
- Job timeout: 60 minutes (configurable via `JOB_TIMEOUT_MINUTES`)
- Docker resource limits: 4 CPU cores, 8GB RAM

## Audio Processing Pipeline

1. File uploaded via `/api/v1/upload`
2. Job created with PENDING status
3. Worker converts: `FFmpeg → 16kHz mono WAV` (via `AudioProcessor`)
4. Transcription runs with timeout protection
5. `Transcription` record saved, job → COMPLETED
6. Webhook sent if `webhook_url` configured

## Stale Job Recovery

On worker startup, always call `reset_stale_jobs()`:
```python
async def reset_stale_jobs(db):
    await db.execute(
        update(Job)
        .where(Job.status == JobStatus.PROCESSING)
        .values(status=JobStatus.QUEUED)
    )
```
This handles jobs left in PROCESSING from a crashed worker.

## KMS Integration

Voice transcription results link to KMS files via `kms_transcription_links`:

```
voice_jobs.id ←→ kms_transcription_links ←→ kms_files.id
```

This is a cross-domain join table. No FK constraints — UUID references only.

After transcription completes, worker publishes an embedding job to RabbitMQ so the transcription text gets indexed in Qdrant.

## Webhook Notifications

If `Job.webhook_url` is set, POST the result:
```json
{
  "job_id": "uuid",
  "status": "COMPLETED",
  "transcription_id": "uuid",
  "processing_time_seconds": 12.4
}
```
Use exponential backoff: 3 retries (5s, 30s, 5min).

## Quality Checklist

- [ ] New provider implements both `transcribe()` and `is_available()`
- [ ] `is_available()` checks API key presence before making network calls
- [ ] `reset_stale_jobs()` called in worker startup
- [ ] FFmpeg conversion always produces 16kHz mono WAV before transcription
- [ ] Webhook uses retry with backoff
- [ ] `prefetch_count=1` set on consumer channel
