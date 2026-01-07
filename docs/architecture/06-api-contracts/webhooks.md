# Webhooks

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

Webhooks enable real-time notifications for system events. Configure webhook endpoints to receive HTTP POST requests when specific events occur.

---

## Webhook Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Event     │────►│   Webhook    │────►│   Your       │
│   Occurs     │     │   Service    │     │   Endpoint   │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                     Retry on failure
                     (3 attempts)
```

---

## Webhook Management

### List Webhooks

```http
GET /api/v1/webhooks
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "wh_abc123",
      "url": "https://api.example.com/webhooks/kms",
      "events": ["file.indexed", "scan.completed"],
      "is_active": true,
      "secret": "whsec_***************",
      "created_at": "2026-01-01T10:00:00Z",
      "last_triggered_at": "2026-01-07T08:00:00Z",
      "stats": {
        "total_deliveries": 150,
        "successful_deliveries": 148,
        "failed_deliveries": 2
      }
    }
  ]
}
```

---

### Create Webhook

```http
POST /api/v1/webhooks
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "url": "https://api.example.com/webhooks/kms",
  "events": ["file.indexed", "scan.completed", "duplicate.detected"],
  "secret": "my-secret-key"
}
```

**Response:** `201 Created`

```json
{
  "id": "wh_xyz789",
  "url": "https://api.example.com/webhooks/kms",
  "events": ["file.indexed", "scan.completed", "duplicate.detected"],
  "is_active": true,
  "secret": "whsec_abc123def456ghi789",
  "created_at": "2026-01-07T10:00:00Z"
}
```

---

### Update Webhook

```http
PATCH /api/v1/webhooks/{webhook_id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "url": "https://api.example.com/webhooks/kms-v2",
  "events": ["file.indexed"],
  "is_active": true
}
```

---

### Delete Webhook

```http
DELETE /api/v1/webhooks/{webhook_id}
Authorization: Bearer <token>
```

**Response:** `204 No Content`

---

### Test Webhook

Send a test event to verify endpoint configuration.

```http
POST /api/v1/webhooks/{webhook_id}/test
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "success": true,
  "response_code": 200,
  "response_time_ms": 150,
  "response_body": "OK"
}
```

---

## Event Types

### File Events

| Event | Description |
|-------|-------------|
| `file.discovered` | New file found during scan |
| `file.indexed` | File successfully indexed |
| `file.updated` | File content updated |
| `file.deleted` | File removed from index |
| `file.failed` | File indexing failed |

### Scan Events

| Event | Description |
|-------|-------------|
| `scan.started` | Scan job started |
| `scan.completed` | Scan job finished successfully |
| `scan.failed` | Scan job failed |

### Duplicate Events

| Event | Description |
|-------|-------------|
| `duplicate.detected` | New duplicate group found |
| `duplicate.resolved` | Duplicate group resolved |

### Source Events

| Event | Description |
|-------|-------------|
| `source.connected` | New source connected |
| `source.disconnected` | Source disconnected |
| `source.error` | Source encountered error |

### Transcription Events

| Event | Description |
|-------|-------------|
| `transcription.completed` | Voice transcription finished |
| `transcription.failed` | Transcription failed |

---

## Webhook Payload

All webhooks follow a standard envelope format:

```json
{
  "id": "evt_abc123def456",
  "type": "file.indexed",
  "created_at": "2026-01-07T10:30:00Z",
  "data": {
    // Event-specific data
  },
  "metadata": {
    "webhook_id": "wh_abc123",
    "attempt": 1,
    "max_attempts": 3
  }
}
```

---

## Event Payloads

### file.indexed

```json
{
  "id": "evt_abc123",
  "type": "file.indexed",
  "created_at": "2026-01-07T10:30:00Z",
  "data": {
    "file": {
      "id": "file_xyz789",
      "name": "report.pdf",
      "path": "/documents/report.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 2097152,
      "source_id": "src_abc123"
    },
    "indexing": {
      "chunks_count": 15,
      "processing_time_ms": 2500,
      "embedding_model": "all-MiniLM-L6-v2"
    }
  }
}
```

### scan.completed

```json
{
  "id": "evt_def456",
  "type": "scan.completed",
  "created_at": "2026-01-07T08:02:00Z",
  "data": {
    "scan_job": {
      "id": "scj_abc123",
      "source_id": "src_xyz789",
      "source_name": "Work Drive",
      "type": "incremental"
    },
    "stats": {
      "files_discovered": 50,
      "files_added": 10,
      "files_updated": 5,
      "files_deleted": 2,
      "errors": 0,
      "duration_seconds": 120
    }
  }
}
```

### duplicate.detected

```json
{
  "id": "evt_ghi789",
  "type": "duplicate.detected",
  "created_at": "2026-01-07T10:00:00Z",
  "data": {
    "group": {
      "id": "grp_abc123",
      "type": "exact",
      "confidence": 1.0,
      "file_count": 3,
      "potential_savings_bytes": 4194304
    },
    "files": [
      {
        "id": "file_xyz789",
        "name": "report.pdf",
        "path": "/documents/report.pdf",
        "is_primary": true
      },
      {
        "id": "file_def456",
        "name": "report (1).pdf",
        "path": "/downloads/report (1).pdf",
        "is_primary": false
      }
    ]
  }
}
```

### transcription.completed

```json
{
  "id": "evt_jkl012",
  "type": "transcription.completed",
  "created_at": "2026-01-07T11:00:00Z",
  "data": {
    "kms_file_id": "file_abc123",
    "voice_job_id": "job_xyz789",
    "transcription": {
      "id": "trans_def456",
      "text_preview": "Welcome to today's meeting. We'll be discussing...",
      "duration_seconds": 3600,
      "word_count": 8500,
      "confidence": 0.95
    }
  }
}
```

---

## Signature Verification

All webhook requests include a signature header for verification:

```http
X-KMS-Signature: sha256=abc123...
X-KMS-Timestamp: 1704625800
```

### Verification Process

```python
import hmac
import hashlib

def verify_webhook(payload: bytes, signature: str, timestamp: str, secret: str) -> bool:
    """
    Verify webhook signature.

    1. Build the signed payload: timestamp.payload
    2. Compute HMAC-SHA256 with your secret
    3. Compare with provided signature
    """
    signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
    expected = hmac.new(
        secret.encode('utf-8'),
        signed_payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(f"sha256={expected}", signature)
```

### Timestamp Validation

Reject webhooks with timestamps older than 5 minutes:

```python
import time

def is_timestamp_valid(timestamp: str, tolerance_seconds: int = 300) -> bool:
    webhook_time = int(timestamp)
    current_time = int(time.time())
    return abs(current_time - webhook_time) <= tolerance_seconds
```

---

## Retry Policy

Failed webhook deliveries are retried with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |

After 3 failed attempts:
- Webhook is marked as `failing`
- Alert sent to account owner
- Automatic disable after 100 consecutive failures

---

## Response Requirements

Your endpoint must:

1. **Return 2xx status** within 30 seconds
2. **Return quickly** (process async if needed)
3. **Be idempotent** (same event may be delivered multiple times)

### Recommended Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"received": true}
```

---

## Schemas

### Webhook

```typescript
interface Webhook {
  id: string;
  url: string;
  events: EventType[];
  is_active: boolean;
  secret: string;
  created_at: string;
  last_triggered_at: string | null;
  stats?: WebhookStats;
}

interface WebhookStats {
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
}

type EventType =
  | "file.discovered"
  | "file.indexed"
  | "file.updated"
  | "file.deleted"
  | "file.failed"
  | "scan.started"
  | "scan.completed"
  | "scan.failed"
  | "duplicate.detected"
  | "duplicate.resolved"
  | "source.connected"
  | "source.disconnected"
  | "source.error"
  | "transcription.completed"
  | "transcription.failed";
```

### Webhook Event

```typescript
interface WebhookEvent<T = any> {
  id: string;
  type: EventType;
  created_at: string;
  data: T;
  metadata: {
    webhook_id: string;
    attempt: number;
    max_attempts: number;
  };
}
```

---

## Delivery Logs

View webhook delivery history:

```http
GET /api/v1/webhooks/{webhook_id}/deliveries
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "del_abc123",
      "event_id": "evt_xyz789",
      "event_type": "file.indexed",
      "status": "success",
      "response_code": 200,
      "response_time_ms": 150,
      "attempt": 1,
      "created_at": "2026-01-07T10:30:00Z"
    },
    {
      "id": "del_def456",
      "event_id": "evt_ghi012",
      "event_type": "scan.completed",
      "status": "failed",
      "response_code": 500,
      "response_time_ms": 5000,
      "attempt": 3,
      "error": "Connection timeout",
      "created_at": "2026-01-07T08:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `WEBHOOK_NOT_FOUND` | Webhook doesn't exist |
| `INVALID_URL` | URL is not valid HTTPS endpoint |
| `INVALID_EVENTS` | Unknown event types specified |
| `WEBHOOK_LIMIT_REACHED` | Maximum webhooks per account (10) |

