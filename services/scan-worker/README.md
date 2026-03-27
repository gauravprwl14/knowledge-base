# scan-worker

Python 3.12 worker that processes file scan jobs from the `kms.scan` RabbitMQ queue.

## Responsibilities
- Consume scan job messages from `kms.scan`
- Walk source files via pluggable `BaseConnector`
- Publish `FileDiscoveredMessage` to `kms.embed` (one per file)
- Publish `DedupCheckMessage` to `kms.dedup` (for duplicate detection)
- Report scan job status back to kms-api via HTTP PATCH

## Port
- 8010 — FastAPI health endpoints only (`/health`, `/health/ready`)

## Adding a New Source Connector
1. Create `app/connectors/my_source.py` subclassing `BaseConnector`
2. Implement `connect()`, `list_files()`, `disconnect()`, `source_type`
3. Call `register_connector(SourceType.MY_SOURCE, MySourceConnector)` at module level
4. Add `SourceType.MY_SOURCE` to the enum in `app/models/messages.py`

## Error Codes
| Code | Meaning |
|------|---------|
| SCN1000 | Invalid scan job payload |
| SCN1001 | Source path not found |
| SCN2000 | Scan job internal failure |
| SCN3000 | External API error (Google Drive etc.) |
| SCN4000 | Queue publish failure |

## Running
```bash
# Development (with hot reload)
docker compose -f docker-compose.kms.yml up scan-worker

# Standalone
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```
