# System Architecture

## Overview

Voice App is a microservices-based speech-to-text application built with a modern, scalable architecture.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client Layer                            │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser    │  │  Mobile App  │  │   API Client │          │
│  │  (React/JS)  │  │   (Future)   │  │    (cURL)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
                    ┌────────▼─────────┐
                    │   Load Balancer  │
                    │   (nginx/proxy)  │
                    └────────┬─────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                      Frontend Layer                               │
│                             │                                     │
│                    ┌────────▼─────────┐                          │
│                    │   Next.js App    │                          │
│                    │   (Port 3000)    │                          │
│                    │                  │                          │
│                    │  - File Upload   │                          │
│                    │  - Job Monitor   │                          │
│                    │  - Results View  │                          │
│                    └────────┬─────────┘                          │
│                             │                                     │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   API Gateway      │
                    │   (FastAPI Router) │
                    └─────────┬──────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────────┐
│                      Backend Layer                                │
│                              │                                    │
│  ┌───────────────────────────▼──────────────────────────┐        │
│  │           FastAPI Application (Port 8000)            │        │
│  │                                                       │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │        │
│  │  │   Upload    │  │    Jobs     │  │Transcription│ │        │
│  │  │  Endpoint   │  │  Endpoint   │  │  Endpoint   │ │        │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │        │
│  │         │                │                 │         │        │
│  │  ┌──────▼────────────────▼─────────────────▼──────┐ │        │
│  │  │          Services Layer                        │ │        │
│  │  │                                                 │ │        │
│  │  │  - File Service      - Queue Service          │ │        │
│  │  │  - Job Service       - Transcription Service  │ │        │
│  │  │  - Auth Service      - Translation Service    │ │        │
│  │  └──────┬─────────────────┬──────────────────────┘ │        │
│  │         │                 │                          │        │
│  │  ┌──────▼─────┐    ┌──────▼──────┐                 │        │
│  │  │  Database  │    │   Message   │                 │        │
│  │  │   Layer    │    │    Queue    │                 │        │
│  │  └────────────┘    └─────────────┘                 │        │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────────┐
│                      Data Layer                                   │
│                              │                                    │
│  ┌───────────────┐   ┌───────▼────────┐   ┌──────────────┐     │
│  │  PostgreSQL   │   │   RabbitMQ     │   │ File Storage │     │
│  │  (Port 5432)  │   │  (Port 5672)   │   │   (./temp)   │     │
│  │               │   │                │   │              │     │
│  │  - Jobs       │   │  - transcription│   │ - Uploads    │     │
│  │  - Transcripts│   │    .queue      │   │ - Processed  │     │
│  │  - API Keys   │   │  - priority    │   │              │     │
│  │               │   │    .queue      │   │              │     │
│  └───────────────┘   └────────────────┘   └──────────────┘     │
└───────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────────┐
│                      Worker Layer                                 │
│                              │                                    │
│  ┌────────────────┬──────────▼────────┬──────────────────┐      │
│  │   Worker 1     │    Worker 2       │    Worker N      │      │
│  │                │                   │                  │      │
│  │  ┌──────────┐  │  ┌──────────┐    │  ┌──────────┐    │      │
│  │  │ Consumer │  │  │ Consumer │    │  │ Consumer │    │      │
│  │  └────┬─────┘  │  └────┬─────┘    │  └────┬─────┘    │      │
│  │       │        │       │           │       │          │      │
│  │  ┌────▼─────┐  │  ┌────▼─────┐    │  ┌────▼─────┐    │      │
│  │  │Processor │  │  │Processor │    │  │Processor │    │      │
│  │  │          │  │  │          │    │  │          │    │      │
│  │  │-Whisper  │  │  │-Whisper  │    │  │-Whisper  │    │      │
│  │  │-FFmpeg   │  │  │-FFmpeg   │    │  │-FFmpeg   │    │      │
│  │  │-Groq API │  │  │-Groq API │    │  │-Groq API │    │      │
│  │  └──────────┘  │  └──────────┘    │  └──────────┘    │      │
│  └────────────────┴───────────────────┴──────────────────┘      │
└───────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────────┐
│                   External Services                               │
│                              │                                    │
│  ┌───────────────┐   ┌───────▼────────┐   ┌──────────────┐     │
│  │  Groq API     │   │ Deepgram API   │   │  OpenAI API  │     │
│  │  (Whisper)    │   │   (Whisper)    │   │  (GPT-4o)    │     │
│  └───────────────┘   └────────────────┘   └──────────────┘     │
│                                                                   │
│  ┌───────────────┐   ┌────────────────┐                         │
│  │ Gemini API    │   │ HuggingFace    │                         │
│  │ (Translation) │   │ (Models)       │                         │
│  └───────────────┘   └────────────────┘                         │
└───────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Frontend Layer (Next.js)

**Technology**: Next.js 14 with React 18, TypeScript, Tailwind CSS

**Responsibilities**:
- User interface for file upload
- Job status monitoring
- Results viewing and download
- API key management

**Key Files**:
- `app/page.tsx` - Main upload page
- `app/jobs/page.tsx` - Jobs listing
- `components/FileUpload.tsx` - Upload component
- `lib/api.ts` - API client

### 2. Backend Layer (FastAPI)

**Technology**: Python 3.11, FastAPI, SQLAlchemy, Pydantic

**Responsibilities**:
- RESTful API endpoints
- Request validation
- Authentication & authorization
- Business logic orchestration
- Queue job dispatching

**Key Directories**:
- `app/api/` - API endpoints
- `app/services/` - Business logic
- `app/db/` - Database models
- `app/schemas/` - Pydantic models

### 3. Data Layer

#### PostgreSQL Database
**Port**: 5432

**Tables**:
- `api_keys` - API key management
- `jobs` - Job tracking
- `transcriptions` - Transcription results
- `translations` - Translation results

#### RabbitMQ Message Queue
**Port**: 5672 (AMQP), 15672 (Management UI)

**Queues**:
- `transcription.queue` - Regular transcription jobs
- `priority.queue` - High-priority jobs

#### File Storage
**Location**: `./temp/`

**Directories**:
- `uploads/` - Uploaded files
- `processed/` - Processed audio files

### 4. Worker Layer

**Technology**: Python 3.11, aio-pika, faster-whisper

**Responsibilities**:
- Consume jobs from RabbitMQ
- Audio/video processing with FFmpeg
- Transcription with Whisper/Cloud APIs
- Translation processing
- Result storage

**Key Files**:
- `app/workers/consumer.py` - Main worker
- `app/services/transcription/` - Transcription providers
- `app/services/translation/` - Translation providers

## Data Flow

### Upload & Transcription Flow

```
1. User Upload
   └─▶ Frontend: Select file + settings
       └─▶ POST /api/v1/upload
           └─▶ Backend: Validate file
               ├─▶ Save to temp/uploads/
               ├─▶ Create Job in DB (status: pending)
               └─▶ Publish to RabbitMQ queue
                   └─▶ Return job_id to user

2. Worker Processing
   └─▶ Worker: Consume from queue
       ├─▶ Update Job (status: processing)
       ├─▶ Process audio with FFmpeg (if video)
       ├─▶ Transcribe with selected provider
       ├─▶ Save Transcription to DB
       ├─▶ Update Job (status: completed)
       └─▶ Clean up temp files

3. Result Retrieval
   └─▶ Frontend: Poll /api/v1/jobs/{id}
       └─▶ GET /api/v1/transcriptions/{id}
           └─▶ Return transcription text
               └─▶ Download in desired format (TXT/JSON/SRT)
```

## Scalability Considerations

### Horizontal Scaling

**Frontend**:
- Stateless Next.js instances
- Can run multiple replicas behind load balancer

**Backend**:
- Stateless FastAPI instances
- Scale with worker count

**Workers**:
- Configure `WORKER_CONCURRENCY`
- Run multiple worker containers
- Each worker processes jobs independently

**Database**:
- PostgreSQL read replicas
- Connection pooling

**Queue**:
- RabbitMQ clustering
- Queue partitioning

### Vertical Scaling

**CPU-Intensive**:
- Whisper transcription (workers)
- FFmpeg processing (workers)

**Memory-Intensive**:
- Large Whisper models (workers)
- Concurrent file processing

**I/O-Intensive**:
- File uploads (backend)
- Database queries (backend)

## Performance Optimizations

1. **Async Processing**: Non-blocking I/O with async/await
2. **Queue-based Jobs**: Background processing
3. **Connection Pooling**: Database connection reuse
4. **File Streaming**: Chunked file uploads
5. **Model Caching**: Whisper models loaded once
6. **Result Caching**: Transcription results cached in DB

## Security Architecture

### Authentication Flow

```
1. API Key Creation
   └─▶ Admin creates API key
       └─▶ Hash stored in DB (SHA-256)
           └─▶ Plain key returned once

2. Request Authentication
   └─▶ Client sends X-API-Key header
       └─▶ Backend hashes key
           └─▶ Lookup in DB
               ├─▶ Valid: Process request
               └─▶ Invalid: Return 403
```

### Security Layers

1. **Input Validation**: Pydantic schemas
2. **File Validation**: Size, type, magic bytes
3. **SQL Injection**: SQLAlchemy ORM
4. **XSS Prevention**: Content-Type validation
5. **Path Traversal**: Secure file paths
6. **Rate Limiting**: Per API key (configurable)

## Monitoring & Logging

### Logs

**Backend**: Structured JSON logs
**Workers**: Job processing logs
**Queue**: RabbitMQ management UI

### Metrics

- Request count & latency
- Job processing time
- Queue depth
- Error rates
- Worker utilization

## Deployment Architecture

### Development
```
Single machine, all services in Docker Compose
```

### Production
```
- Frontend: Vercel/Netlify or Docker
- Backend: Kubernetes/ECS with auto-scaling
- Database: Managed PostgreSQL (RDS/Cloud SQL)
- Queue: Managed RabbitMQ (CloudAMQP)
- Workers: Kubernetes Jobs with GPU support
```

## Technology Decisions

### Why FastAPI?
- High performance (async)
- Auto-generated OpenAPI docs
- Type safety with Pydantic
- Modern Python async/await

### Why Next.js?
- Server-side rendering
- File-based routing
- TypeScript support
- Production-ready

### Why RabbitMQ?
- Reliable message delivery
- Multiple queue types
- Dead letter queues
- Management UI

### Why PostgreSQL?
- ACID compliance
- JSON support
- Full-text search
- Mature ecosystem

### Why faster-whisper?
- 4x faster than openai-whisper
- Lower memory usage
- ARM64 support
- Same accuracy

## Future Enhancements

1. **Caching Layer**: Redis for hot data
2. **CDN**: Static asset delivery
3. **Blob Storage**: S3/GCS for files
4. **Streaming**: WebSocket for real-time updates
5. **ML Pipeline**: Custom model training
6. **Multi-tenancy**: Organization support
7. **Analytics**: Usage tracking & reporting

---

**Last Updated**: January 6, 2026
