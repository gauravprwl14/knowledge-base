# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice App is a speech-to-text microservice with video support, bulk processing, and queue-based architecture. It supports multiple transcription providers (local Whisper, Groq, Deepgram) and translation services (OpenAI, Google Gemini).

**Stack:**
- Backend: FastAPI (Python 3.x) with async/await
- Frontend: Next.js 14 (App Router) with TypeScript
- Database: PostgreSQL with SQLAlchemy (async)
- Queue: RabbitMQ with aio-pika
- Worker: Background consumer for transcription jobs
- Audio Processing: FFmpeg, faster-whisper

## Architecture

The system follows an event-driven, queue-based architecture:

```
Frontend → Backend API → RabbitMQ → Worker Pool → Database
                ↓           ↓           ↓
            PostgreSQL   Job Queues   Transcription
```

**Key Components:**

1. **Backend (FastAPI)**: RESTful API with API key authentication
   - API endpoints in `backend/app/api/v1/endpoints/`
   - Business logic in `backend/app/services/`
   - Database models in `backend/app/db/models/`

2. **Worker System** (`backend/app/workers/`):
   - `consumer.py`: Processes transcription jobs from RabbitMQ queues
   - `job_dispatcher.py`: Auto-publishes pending jobs to queue
   - Handles job timeouts, stale job recovery, and webhook notifications

3. **Job Monitor** (`backend/app/services/job_monitor.py`): Background service that marks timed-out jobs as failed

4. **Transcription Providers** (`backend/app/services/transcription/`):
   - Provider pattern with factory (`factory.py`)
   - Base class: `base.py` (TranscriptionProvider interface)
   - Implementations: `whisper.py`, `groq.py`, `deepgram.py`
   - Each provider implements `transcribe()` and `is_available()`

5. **Frontend (Next.js)**:
   - Server-side API client in `frontend/lib/api.ts`
   - Pages in `frontend/app/` (App Router structure)
   - Minimal UI components in `frontend/components/`

## Common Commands

### Docker Compose (Primary Development Method)

**Development with Hot Reload** (no rebuild needed for code changes):

```bash
# Start all services with hot reload enabled
docker-compose up -d

# View logs with live reload feedback
docker-compose logs -f backend
docker-compose logs -f worker
docker-compose logs -f frontend

# Restart specific service
docker-compose restart worker

# Stop all services
docker-compose down

# Rebuild ONLY when dependencies change (requirements.txt, package.json)
docker-compose up -d --build backend
```

**Note**: The `docker-compose.override.yml` file is automatically loaded and provides:
- Hot reload via bind mounts (code changes reflect in 1-2 seconds)
- Source code mounted as read-only (`:ro`)
- No rebuild required for code changes
- Postgres exposed on localhost:5432 for GUI tools

**Testing with Docker**:

```bash
# Run all tests in parallel
docker-compose -f docker-compose.test.yml up --abort-on-container-exit

# Run specific test suites
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests
docker-compose -f docker-compose.test.yml run --rm backend_integration_tests
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests
docker-compose -f docker-compose.test.yml up --abort-on-container-exit frontend_e2e_tests

# Run specific test file
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
  pytest tests/unit/test_whisper_caching.py -v
```

**Production Deployment** (VPS/EC2):

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml up -d

# View production logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Backend Development

```bash
cd backend

# Create virtual environment (first time)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-test.txt  # For testing

# Run backend server (manual mode)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run worker (manual mode, in separate terminal)
python -m app.workers.consumer

# Run dispatcher (manual mode, in separate terminal)
python -m app.workers.job_dispatcher

# Run tests
pytest                          # All tests
pytest tests/unit/              # Unit tests only
pytest tests/integration/       # Integration tests only
pytest -v -s                    # Verbose with print output
pytest --cov=app --cov-report=html  # With coverage report

# Run specific test file
pytest tests/unit/test_whisper_caching.py -v
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Run tests
npm test                        # Unit tests (Jest)
npm run test:watch              # Watch mode
npm run test:coverage           # With coverage
npm run test:e2e                # End-to-end tests (Playwright)
npm run test:e2e:ui             # E2E tests with UI
npm run test:e2e:report         # Show E2E test report

# Lint
npm run lint
```

### Testing (All)

```bash
# Run all tests (backend + frontend) from root
./run-all-tests.sh
```

### Database Management

```bash
# Enter backend container to create API key
docker-compose exec backend bash

# Create API key (inside container)
python3 << 'EOF'
import asyncio
import hashlib
import secrets
from app.db.session import AsyncSessionLocal
from app.db.models import APIKey

async def create_key():
    key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    async with AsyncSessionLocal() as db:
        api_key = APIKey(key_hash=key_hash, name="Default Key", is_active=True)
        db.add(api_key)
        await db.commit()
    print(f"API Key: {key}")

asyncio.run(create_key())
EOF
```

## Key Implementation Patterns

### Job Lifecycle

Jobs transition through states: `PENDING → QUEUED → PROCESSING → COMPLETED/FAILED/CANCELLED`

- **PENDING**: Job created, not yet published to queue
- **QUEUED**: Published to RabbitMQ, waiting for worker
- **PROCESSING**: Worker actively processing
- **COMPLETED**: Successfully transcribed
- **FAILED**: Error occurred (see `error_message` field)
- **CANCELLED**: User cancelled

The dispatcher (`job_dispatcher.py`) automatically publishes PENDING jobs to RabbitMQ. Workers pick up jobs from queues and process them.

### Adding New Transcription Provider

1. Create new file in `backend/app/services/transcription/`
2. Inherit from `TranscriptionProvider` (from `base.py`)
3. Implement `async def transcribe()` and `async def is_available()`
4. Return `TranscriptionResult` object
5. Register in `factory.py` using `TranscriptionFactory.register_provider()`

### Authentication

All API requests require `X-API-Key` header. Authentication handled by `get_current_api_key()` dependency in `backend/app/dependencies.py`.

### RabbitMQ Queue Structure

- **Exchange**: `voice_app.direct` (direct exchange)
- **Queues**:
  - `transcription.queue` (routing key: "transcription")
  - `priority.queue` (routing key: "priority")
  - `failed.queue` (dead letter queue)
- **Dead Letter Exchange**: `voice_app.dlx`

Priority jobs use `priority` routing key. All queues support priority 0-10.

### Audio Processing Pipeline

1. File uploaded to backend (`/api/v1/upload`)
2. Job created in database with PENDING status
3. Dispatcher publishes to RabbitMQ (status → QUEUED)
4. Worker consumes message:
   - Updates status to PROCESSING
   - Converts to 16kHz mono WAV using FFmpeg (`AudioProcessor`)
   - Runs transcription with timeout protection
   - Saves `Transcription` record
   - Updates job to COMPLETED/FAILED
   - Sends webhook if configured

### Worker Concurrency & Resource Limits

- Worker uses `ThreadPoolExecutor` with max 2 workers for CPU-intensive Whisper tasks
- RabbitMQ `prefetch_count=1` prevents worker overload with large models
- Docker resource limits: 4 CPU cores, 8GB RAM (for large-v3 model)
- Job timeout: 60 minutes (configurable via `JOB_TIMEOUT_MINUTES`)

### Stale Job Recovery

On worker startup, `reset_stale_jobs()` resets any jobs stuck in PROCESSING (from crashed workers) back to QUEUED.

### Model Caching

Whisper models are downloaded to `./models/` and cached. First use of a model triggers download from HuggingFace.

### Environment Configuration

Key settings in `.env` (see `.env.example`):
- API keys for providers (GROQ_API_KEY, DEEPGRAM_API_KEY, etc.)
- Database URL, RabbitMQ URL
- File size limits, allowed extensions
- Worker concurrency, job timeout
- Temp file directories

Settings loaded via Pydantic `BaseSettings` in `backend/app/config.py`.

## Database Models

Key models in `backend/app/db/models/`:

- **Job**: Main job record with status, provider, model settings, file info, timestamps
- **Transcription**: Result text, segments, confidence, processing time
- **APIKey**: Authentication keys (hashed with SHA256)

Relationships:
- Job (1) → Transcription (1) with cascade delete
- APIKey (1) → Jobs (many)

## Frontend API Client

Centralized in `frontend/lib/api.ts` as `VoiceAppApi` class:
- Upload, job management, transcription operations
- Automatic API key header injection
- Type-safe methods

## Testing Strategy

- **Backend**: pytest with async support (`pytest-asyncio`)
  - Unit tests: Individual service/provider tests
  - Integration tests: Database, RabbitMQ, full workflow
- **Frontend**: Jest (unit/component) + Playwright (E2E)
- Test configuration: `backend/pytest.ini`, `frontend/jest.config.js`, `frontend/playwright.config.ts`

## Important Notes

- **Database migrations**: Auto-created on startup via `Base.metadata.create_all()` in `main.py` lifespan
- **CORS**: Only allows `http://localhost:3000` in development
- **File cleanup**: Temp files have 24-hour TTL (configurable)
- **Webhook support**: Jobs can specify `webhook_url` for completion notifications
- **Translation**: Separate flow via `/transcriptions/{id}/translate` endpoint
- **Download formats**: TXT, JSON, SRT (subtitles) via `/transcriptions/{id}/download?format=`

## Docker Infrastructure

### Multi-Stage Dockerfiles

Both backend and frontend Dockerfiles use multi-stage builds:

**Backend** (`backend/Dockerfile`):
- `base`: OS dependencies, system packages
- `dependencies`: Production Python packages
- `development`: Test dependencies + hot reload setup (target for dev)
- `test`: Test dependencies + postgres client (target for testing)
- `production`: Optimized runtime, non-root user (default target)

**Frontend** (`frontend/Dockerfile`):
- `base`: Node 20 Alpine base
- `deps`: npm dependencies cached
- `development`: Hot reload setup (target for dev)
- `test`: Playwright browsers included (target for testing)
- `builder`: Build Next.js application
- `runner`: Production-optimized runtime (default target)

### .dockerignore Files

**Backend** (`backend/.dockerignore`):
- Excludes: Python cache, venv, tests artifacts, IDE files, docs, git
- Reduces build context from ~10MB to ~500KB (95% reduction)

**Frontend** (`frontend/.dockerignore`):
- Excludes: node_modules, .next, build outputs, test artifacts, IDE files
- Reduces build context from ~375MB to ~2MB (99% reduction)

### Hot Reload Configuration

**Development** (`docker-compose.override.yml`):
- Automatically loaded by `docker-compose up`
- Source code bind-mounted as read-only (`:ro`)
- Backend: Python auto-reload via uvicorn `--reload`
- Frontend: Next.js Fast Refresh via `npm run dev`
- Code changes reflect in 1-2 seconds without rebuild
- Postgres exposed on localhost:5432 for GUI tools

**Testing** (`docker-compose.test.yml`):
- Isolated test environment with tmpfs database (10x faster)
- Separate postgres_test and rabbitmq_test services
- Run all tests: `docker-compose -f docker-compose.test.yml up --abort-on-container-exit`
- Run individual suites: `docker-compose -f docker-compose.test.yml run --rm backend_unit_tests`
- Health checks ensure dependencies ready before tests run
- Coverage reports stored in named volumes

**Production** (`docker-compose.prod.yml`):
- Production-optimized images with security hardening
- Network isolation (backend_network, frontend_network)
- Required environment variables enforced with `:?` syntax
- Restart policies: `unless-stopped`
- Resource limits for worker and dispatcher
- Optional Nginx reverse proxy included

### Documentation

Comprehensive guides available in `docs/`:
- **DOCKER_DEVELOPMENT.md**: Hot reload setup, debugging, macOS optimization
- **DOCKER_TESTING.md**: Test infrastructure, running tests, coverage reports
- **DEPLOYMENT.md**: VPS/EC2 deployment, SSL setup, monitoring, backups

## Service URLs (Docker)

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- RabbitMQ Management: http://localhost:15672 (guest/guest)
- PostgreSQL: localhost:5432

## Common Troubleshooting

- **Worker not processing**: Check `docker-compose logs worker` and RabbitMQ queue status
- **Database connection errors**: Verify postgres container is healthy
- **Model download fails**: Check internet connection and HuggingFace availability
- **Jobs stuck in PROCESSING**: Restart worker (triggers stale job recovery)
