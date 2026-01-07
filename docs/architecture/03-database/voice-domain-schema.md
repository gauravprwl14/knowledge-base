# Voice Domain Schema

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The Voice domain manages transcription jobs and results. These tables are owned by the voice-app service and integrate with KMS for audio/video file transcription.

---

## Domain Boundaries

| Aspect | Value |
|--------|-------|
| **Prefix** | `voice_` |
| **Owner Service** | voice-app |
| **Write Access** | voice-app only |
| **Read Access** | voice-app, kms-api (via integration table) |
| **Future Database** | voice-db |

---

## Tables

### voice_jobs

Transcription job records tracking the full lifecycle.

```sql
CREATE TABLE voice_jobs (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Authentication (soft reference to auth domain)
    api_key_id UUID NOT NULL,       -- References auth_api_keys
    user_id UUID,                    -- Optional user reference

    -- Job status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,

    -- Provider configuration
    provider VARCHAR(50) NOT NULL DEFAULT 'whisper',
    model VARCHAR(100) NOT NULL DEFAULT 'base',
    language VARCHAR(10),           -- ISO code or NULL for auto-detect

    -- File information
    original_filename VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size BIGINT NOT NULL,
    file_duration_seconds NUMERIC(10, 2),
    mime_type VARCHAR(255),

    -- Processing options
    priority INTEGER NOT NULL DEFAULT 5,  -- 0-10, higher = more urgent
    options JSONB DEFAULT '{}',

    -- Webhook
    webhook_url VARCHAR(1000),
    webhook_sent BOOLEAN NOT NULL DEFAULT false,
    webhook_response JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    queued_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT chk_job_status CHECK (
        status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT chk_provider CHECK (provider IN ('whisper', 'groq', 'deepgram')),
    CONSTRAINT chk_priority CHECK (priority >= 0 AND priority <= 10)
);

-- Indexes
CREATE INDEX idx_voice_jobs_api_key ON voice_jobs(api_key_id);
CREATE INDEX idx_voice_jobs_user_id ON voice_jobs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_voice_jobs_status ON voice_jobs(status);
CREATE INDEX idx_voice_jobs_pending ON voice_jobs(priority DESC, created_at ASC)
    WHERE status = 'pending';
CREATE INDEX idx_voice_jobs_created_at ON voice_jobs(created_at DESC);
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `api_key_id` | UUID | NO | API key used |
| `user_id` | UUID | YES | Optional user |
| `status` | VARCHAR(50) | NO | Job status |
| `error_message` | TEXT | YES | Error details |
| `provider` | VARCHAR(50) | NO | Transcription provider |
| `model` | VARCHAR(100) | NO | Model name |
| `language` | VARCHAR(10) | YES | Language hint |
| `original_filename` | VARCHAR(500) | NO | Original name |
| `file_path` | VARCHAR(1000) | NO | Storage path |
| `file_size` | BIGINT | NO | File size |
| `file_duration_seconds` | NUMERIC | YES | Audio duration |
| `mime_type` | VARCHAR(255) | YES | File type |
| `priority` | INTEGER | NO | Job priority |
| `options` | JSONB | YES | Extra options |
| `webhook_url` | VARCHAR(1000) | YES | Callback URL |
| `webhook_sent` | BOOLEAN | NO | Webhook delivered |
| `webhook_response` | JSONB | YES | Webhook result |
| `created_at` | TIMESTAMP | NO | Creation time |
| `queued_at` | TIMESTAMP | YES | Queue time |
| `started_at` | TIMESTAMP | YES | Processing start |
| `completed_at` | TIMESTAMP | YES | Completion time |

#### Options JSON Schema

```json
{
  "detect_language": true,
  "word_timestamps": true,
  "speaker_diarization": false,
  "max_speakers": 2,
  "translate_to": "en",
  "chunk_length_seconds": 30
}
```

#### Job Status Flow

```
pending → queued → processing → completed
                            ↘ failed
            ↘ cancelled
```

---

### voice_transcriptions

Transcription results with segment-level detail.

```sql
CREATE TABLE voice_transcriptions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationship
    job_id UUID NOT NULL UNIQUE REFERENCES voice_jobs(id) ON DELETE CASCADE,

    -- Full text
    text TEXT NOT NULL,

    -- Segments (word/sentence level)
    segments JSONB NOT NULL DEFAULT '[]',

    -- Metadata
    language VARCHAR(10),            -- Detected language
    confidence NUMERIC(4, 3),        -- Overall confidence (0-1)
    word_count INTEGER NOT NULL,

    -- Processing info
    processing_time_ms INTEGER NOT NULL,
    model_used VARCHAR(100) NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_voice_trans_job_id ON voice_transcriptions(job_id);
CREATE INDEX idx_voice_trans_language ON voice_transcriptions(language);

-- Full-text search
CREATE INDEX idx_voice_trans_text_search ON voice_transcriptions
    USING GIN(to_tsvector('english', text));
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `job_id` | UUID | NO | Parent job (unique) |
| `text` | TEXT | NO | Full transcription |
| `segments` | JSONB | NO | Time-aligned segments |
| `language` | VARCHAR(10) | YES | Detected language |
| `confidence` | NUMERIC(4,3) | YES | Confidence score |
| `word_count` | INTEGER | NO | Total words |
| `processing_time_ms` | INTEGER | NO | Processing duration |
| `model_used` | VARCHAR(100) | NO | Actual model used |
| `created_at` | TIMESTAMP | NO | Creation time |

#### Segments JSON Schema

```json
[
  {
    "id": 0,
    "start": 0.0,
    "end": 2.5,
    "text": "Hello, welcome to the meeting.",
    "confidence": 0.95,
    "words": [
      {"word": "Hello", "start": 0.0, "end": 0.4, "confidence": 0.98},
      {"word": "welcome", "start": 0.5, "end": 0.9, "confidence": 0.96}
    ],
    "speaker": "SPEAKER_00"
  }
]
```

---

## Status Enums

### Job Status

| Status | Description | Next States |
|--------|-------------|-------------|
| `pending` | Created, awaiting queue | queued, cancelled |
| `queued` | In RabbitMQ queue | processing, cancelled |
| `processing` | Worker processing | completed, failed |
| `completed` | Successfully transcribed | - |
| `failed` | Error occurred | - |
| `cancelled` | User cancelled | - |

### Provider Types

| Provider | Description | Models |
|----------|-------------|--------|
| `whisper` | Local faster-whisper | tiny, base, small, medium, large-v3 |
| `groq` | Groq cloud API | whisper-large-v3 |
| `deepgram` | Deepgram cloud API | nova-2, enhanced |

---

## Common Queries

### Get Job with Transcription

```sql
SELECT
    j.id,
    j.status,
    j.provider,
    j.model,
    j.original_filename,
    j.file_duration_seconds,
    j.created_at,
    j.completed_at,
    t.text,
    t.language,
    t.confidence,
    t.word_count,
    t.processing_time_ms
FROM voice_jobs j
LEFT JOIN voice_transcriptions t ON j.id = t.job_id
WHERE j.id = $1;
```

### List User's Jobs

```sql
SELECT
    j.id,
    j.status,
    j.provider,
    j.original_filename,
    j.file_duration_seconds,
    j.created_at,
    j.completed_at,
    CASE WHEN t.id IS NOT NULL THEN true ELSE false END AS has_transcription
FROM voice_jobs j
LEFT JOIN voice_transcriptions t ON j.id = t.job_id
WHERE j.api_key_id = $1
ORDER BY j.created_at DESC
LIMIT 50 OFFSET 0;
```

### Get Pending Jobs for Processing

```sql
SELECT
    j.id,
    j.provider,
    j.model,
    j.file_path,
    j.options
FROM voice_jobs j
WHERE j.status = 'pending'
ORDER BY j.priority DESC, j.created_at ASC
LIMIT 10
FOR UPDATE SKIP LOCKED;
```

### Search Transcriptions

```sql
SELECT
    j.id AS job_id,
    j.original_filename,
    t.text,
    ts_rank(to_tsvector('english', t.text), query) AS rank
FROM voice_transcriptions t
JOIN voice_jobs j ON t.job_id = j.id,
     to_tsquery('english', $1) query
WHERE j.api_key_id = $2
  AND to_tsvector('english', t.text) @@ query
ORDER BY rank DESC
LIMIT 20;
```

---

## Integration with KMS

### Cross-Domain Query Pattern

KMS accesses voice data through the integration table:

```sql
-- From kms-api: Get transcription status for a file
SELECT
    tl.status,
    tl.voice_job_id,
    tl.updated_at
FROM kms_transcription_links tl
WHERE tl.file_id = $1;

-- From kms-api: Trigger transcription (creates link, voice-app polls)
INSERT INTO kms_transcription_links (file_id, status)
VALUES ($1, 'pending')
ON CONFLICT (file_id) DO UPDATE SET status = 'pending', updated_at = NOW();
```

### Webhook Integration

Voice-app notifies KMS of completion via webhook:

```json
{
  "event": "transcription.completed",
  "job_id": "uuid",
  "transcription": {
    "text": "...",
    "language": "en",
    "word_count": 150,
    "processing_time_ms": 5000
  }
}
```

KMS receives webhook and updates the link:

```sql
UPDATE kms_transcription_links
SET status = 'completed', updated_at = NOW()
WHERE voice_job_id = $1;
```

---

## Data Retention

| Table | Retention | Strategy |
|-------|-----------|----------|
| `voice_jobs` | 1 year | Archive to cold storage |
| `voice_transcriptions` | With job | Cascade delete |
| Audio files | 30 days | Delete after transcription |

### Cleanup Query

```sql
-- Delete old completed jobs (files already cleaned)
DELETE FROM voice_jobs
WHERE status IN ('completed', 'failed', 'cancelled')
  AND completed_at < NOW() - INTERVAL '1 year';
```

---

## Migration Notes

When splitting to separate voice database:

1. **Remove auth FK references** - Use application-level validation
2. **Update kms_transcription_links** - Remains in KMS DB
3. **Implement event sync** - Use RabbitMQ for status updates
4. **API gateway routing** - Route `/transcription/*` to voice-db

