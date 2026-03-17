# Flow: Source Connect and File Scan

## Overview

A user connects a file source (local folder, Google Drive) to KMS. kms-api persists the source, publishes a scan job to RabbitMQ. scan-worker discovers files, computes SHA-256 checksums, and publishes `file.discovered` events for downstream processing.

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as kms-api
    participant DB as PostgreSQL
    participant Q as RabbitMQ (kms.scan)
    participant SW as scan-worker
    participant EQ as RabbitMQ (kms.embed)
    participant DQ as RabbitMQ (kms.dedup)

    C->>A: POST /api/v1/sources { type: "local", path: "/vault" }
    A->>DB: INSERT INTO kms_sources (user_id, type, config)
    DB-->>A: { source_id }
    A->>Q: publish ScanJobMessage { source_id, user_id }
    A-->>C: 201 Created { source_id, status: "pending" }

    Note over Q,SW: Async — worker picks up when ready

    Q-->>SW: consume ScanJobMessage
    SW->>A: PATCH /api/v1/sources/{source_id} { status: "scanning" }

    loop For each file discovered
        SW->>SW: compute SHA-256 checksum
        SW->>EQ: publish FileDiscoveredMessage { file_id, checksum, path }
        SW->>DQ: publish DedupCheckMessage { file_id, checksum }
    end

    SW->>A: PATCH /api/v1/sources/{source_id} { status: "completed", file_count: N }
```

## Error Flows

| Step | Failure | Handling |
|---|---|---|
| DB insert fails | Source creation fails | 500 returned to client, no queue message published |
| Scan worker crashes | Message nack'd → requeue | connect_robust() reconnects; stale `scanning` source reset on restart |
| File unreadable | Logged, skipped, count decremented | Partial scan still completes |
| kms-api PATCH unreachable | Worker retries 3x with backoff | Source status may stay `scanning` — monitor via job health check |

## Dependencies

- `kms-api`: Source CRUD endpoints
- `RabbitMQ`: `kms.scan` (input), `kms.embed` (output), `kms.dedup` (output)
- `scan-worker`: File connector + SHA-256 checksum computation
- `PostgreSQL`: `kms_sources` table
