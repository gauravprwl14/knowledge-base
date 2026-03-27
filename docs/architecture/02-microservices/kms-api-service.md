# kms-api Service

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The `kms-api` is the main API gateway for the Knowledge Management System. It handles all user-facing operations including authentication, source management, file operations, and job orchestration.

---

## Service Identity

| Property | Value |
|----------|-------|
| **Name** | kms-api |
| **Language** | TypeScript |
| **Framework** | NestJS 10.x |
| **Port** | 8000 |
| **Type** | API Service (Synchronous) |
| **Repository** | /kms-api |

---

## Responsibilities

### Primary Responsibilities

1. **User Authentication**
   - Email/password registration and login
   - Google OAuth integration
   - JWT token management
   - Session handling

2. **API Key Management**
   - Generate, list, revoke API keys
   - Scope-based permissions
   - API key authentication

3. **Source Management**
   - Connect/disconnect sources (Google Drive, Local FS)
   - OAuth token management
   - Source configuration

4. **File Operations**
   - CRUD operations on files
   - Bulk operations
   - File metadata queries

5. **Scan Job Orchestration**
   - Create scan jobs
   - Track scan progress
   - Publish to scan.queue

6. **Duplicate Management**
   - List duplicate groups
   - Mark primary files
   - Bulk delete duplicates

7. **Junk File Management**
   - List junk files
   - Bulk cleanup
   - Exclude false positives

8. **Webhook Dispatch**
   - Send completion notifications
   - Handle incoming webhooks (voice-app)

---

## Tech Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Runtime** | Node.js | 20.x | JavaScript runtime |
| **Framework** | NestJS | 10.x | API framework |
| **Language** | TypeScript | 5.x | Type safety |
| **ORM** | TypeORM | 0.3.x | Database abstraction |
| **Validation** | class-validator | 0.14.x | DTO validation |
| **Auth** | Passport.js | 0.7.x | Authentication |
| **JWT** | @nestjs/jwt | 10.x | Token handling |
| **Queue** | @nestjs/bull | 10.x | RabbitMQ client |
| **Swagger** | @nestjs/swagger | 7.x | API documentation |
| **HTTP Client** | axios | 1.x | External API calls |
| **Encryption** | crypto | (built-in) | Token encryption |
| **Testing** | Jest | 29.x | Unit/integration tests |

---

## Database Tables (Owned)

### Auth Domain (`auth_*`)

| Table | Purpose |
|-------|---------|
| `auth_users` | User accounts |
| `auth_api_keys` | API keys |
| `auth_teams` | Team records (future) |
| `auth_team_members` | Team membership (future) |

### KMS Domain (`kms_*`)

| Table | Purpose |
|-------|---------|
| `kms_sources` | Connected sources |
| `kms_scan_jobs` | Scan job records |
| `kms_files` | File metadata |
| `kms_duplicates` | Duplicate groups |
| `kms_embeddings` | Embedding references |
| `kms_transcription_links` | Voice-app integration |

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | User registration |
| POST | /api/v1/auth/login | User login |
| GET | /api/v1/auth/google | Google OAuth initiate |
| GET | /api/v1/auth/google/callback | Google OAuth callback |
| POST | /api/v1/auth/logout | Logout |
| GET | /api/v1/auth/me | Current user |

### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/api-keys | List API keys |
| POST | /api/v1/api-keys | Create API key |
| DELETE | /api/v1/api-keys/:id | Revoke API key |

### Sources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/sources | List sources |
| POST | /api/v1/sources/google-drive/connect | Connect Google Drive |
| GET | /api/v1/sources/google-drive/callback | OAuth callback |
| DELETE | /api/v1/sources/:id | Disconnect source |
| PATCH | /api/v1/sources/:id | Update source config |

### Scan Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/scan-jobs | List scan jobs |
| POST | /api/v1/scan-jobs | Create scan job |
| GET | /api/v1/scan-jobs/:id | Get scan job |
| POST | /api/v1/scan-jobs/:id/cancel | Cancel scan job |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/files | List files |
| GET | /api/v1/files/:id | Get file |
| DELETE | /api/v1/files/:id | Delete file |
| POST | /api/v1/files/bulk/delete | Bulk delete |
| POST | /api/v1/files/:id/transcribe | Trigger transcription |
| GET | /api/v1/files/:id/transcription-status | Get transcription status |

### Duplicates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/duplicates | List duplicate groups |
| PATCH | /api/v1/duplicates/:group_id | Update group (mark primary) |
| POST | /api/v1/duplicates/bulk/delete | Delete duplicates |

### Junk Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/junk-files | List junk files |
| POST | /api/v1/junk-files/bulk/delete | Bulk delete junk |
| PATCH | /api/v1/files/:id/not-junk | Mark as not junk |

### Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/stats | Dashboard stats |

---

## Module Structure

```
kms-api/
├── src/
│   ├── main.ts                    # Application bootstrap
│   ├── app.module.ts              # Root module
│   │
│   ├── config/
│   │   └── configuration.ts       # Configuration loader
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── register.dto.ts
│   │   │   │   └── login.dto.ts
│   │   │   ├── strategies/
│   │   │   │   ├── local.strategy.ts
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── google.strategy.ts
│   │   │   └── guards/
│   │   │       ├── jwt-auth.guard.ts
│   │   │       └── api-key.guard.ts
│   │   │
│   │   ├── api-keys/
│   │   │   ├── api-keys.module.ts
│   │   │   ├── api-keys.controller.ts
│   │   │   └── api-keys.service.ts
│   │   │
│   │   ├── sources/
│   │   │   ├── sources.module.ts
│   │   │   ├── sources.controller.ts
│   │   │   ├── sources.service.ts
│   │   │   └── providers/
│   │   │       └── google-drive.provider.ts
│   │   │
│   │   ├── scan-jobs/
│   │   │   ├── scan-jobs.module.ts
│   │   │   ├── scan-jobs.controller.ts
│   │   │   └── scan-jobs.service.ts
│   │   │
│   │   ├── files/
│   │   │   ├── files.module.ts
│   │   │   ├── files.controller.ts
│   │   │   └── files.service.ts
│   │   │
│   │   ├── duplicates/
│   │   │   ├── duplicates.module.ts
│   │   │   ├── duplicates.controller.ts
│   │   │   └── duplicates.service.ts
│   │   │
│   │   └── junk/
│   │       ├── junk.module.ts
│   │       ├── junk.controller.ts
│   │       └── junk.service.ts
│   │
│   ├── entities/
│   │   ├── user.entity.ts
│   │   ├── api-key.entity.ts
│   │   ├── source.entity.ts
│   │   ├── scan-job.entity.ts
│   │   ├── file.entity.ts
│   │   └── duplicate.entity.ts
│   │
│   ├── common/
│   │   ├── exceptions/
│   │   │   └── app.exception.ts
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts
│   │   ├── interceptors/
│   │   │   └── logging.interceptor.ts
│   │   └── decorators/
│   │       └── api-key.decorator.ts
│   │
│   └── queue/
│       └── queue.service.ts       # RabbitMQ publisher
│
├── test/
│   ├── unit/
│   └── integration/
│
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## Dependencies

### Internal Dependencies

| Service | Purpose | Communication |
|---------|---------|---------------|
| PostgreSQL | Data storage | Direct (TypeORM) |
| RabbitMQ | Job queuing | Direct (Bull) |
| Redis | Caching, sessions | Direct (ioredis) |

### External Dependencies

| Service | Purpose | Communication |
|---------|---------|---------------|
| Google APIs | OAuth, Drive access | HTTP (REST) |
| voice-app | Transcription | HTTP (REST) |
| search-api | Search queries | HTTP (REST) |

---

## Queue Integration

### Publishing

| Queue | Event | Trigger |
|-------|-------|---------|
| scan.queue | SCAN_REQUESTED | POST /scan-jobs |
| trans.queue | TRANSCRIBE_REQUESTED | POST /files/:id/transcribe |

### Message Format

```json
{
  "event_type": "SCAN_REQUESTED",
  "correlation_id": "uuid",
  "timestamp": "2026-01-07T10:00:00Z",
  "payload": {
    "scan_job_id": "uuid",
    "source_id": "uuid",
    "user_id": "uuid"
  }
}
```

---

## Configuration

```yaml
# Environment variables
PORT: 8000
NODE_ENV: production

# Database
DATABASE_URL: postgresql://user:pass@postgres:5432/kms

# RabbitMQ
RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672

# Redis
REDIS_URL: redis://redis:6379

# JWT
JWT_SECRET: your-secret-key
JWT_EXPIRATION: 7d

# Google OAuth
GOOGLE_CLIENT_ID: xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET: xxx
GOOGLE_CALLBACK_URL: http://localhost:8000/api/v1/auth/google/callback

# Encryption
ENCRYPTION_KEY: 32-byte-hex-key

# External Services
VOICE_APP_URL: http://voice-app:8000
SEARCH_API_URL: http://search-api:8001
```

---

## Error Codes

| Code | Message | HTTP Status |
|------|---------|-------------|
| KMS1001 | User not found | 404 |
| KMS1002 | Invalid credentials | 401 |
| KMS1003 | Email already exists | 409 |
| KMS1004 | API key not found | 404 |
| KMS1005 | API key expired | 401 |
| KMS2001 | Source not found | 404 |
| KMS2002 | OAuth token invalid | 401 |
| KMS2003 | Source already connected | 409 |
| KMS3001 | File not found | 404 |
| KMS3002 | File access denied | 403 |
| KMS4001 | Scan job not found | 404 |
| KMS4002 | Scan in progress | 409 |

---

## Health Check

```
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2026-01-07T10:00:00Z",
  "checks": {
    "database": "healthy",
    "rabbitmq": "healthy",
    "redis": "healthy"
  }
}
```

---

## Scaling Strategy

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU | > 70% | Scale up |
| Memory | > 80% | Scale up |
| Request latency (p95) | > 500ms | Scale up |
| Instance count | < 2 | Scale up (min 2) |
| Instance count | > 8 | Scale down (max 8) |

---

## Deployment

```yaml
# docker-compose service definition
kms-api:
  build:
    context: ./kms-api
    target: production
  ports:
    - "8000:8000"
  environment:
    - NODE_ENV=production
    - DATABASE_URL=${DATABASE_URL}
    - RABBITMQ_URL=${RABBITMQ_URL}
  depends_on:
    - postgres
    - rabbitmq
    - redis
  deploy:
    replicas: 2
    resources:
      limits:
        cpus: '2'
        memory: 2G
```
