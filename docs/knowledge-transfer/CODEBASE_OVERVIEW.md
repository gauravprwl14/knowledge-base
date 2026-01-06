# Codebase Overview

This document provides a comprehensive overview of the Voice App codebase structure and organization.

## Repository Structure

```
voice-app/
├── backend/                 # Python FastAPI backend
│   ├── app/
│   │   ├── api/            # API endpoint routes
│   │   ├── db/             # Database models and session
│   │   ├── schemas/        # Pydantic models
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Utility functions
│   │   ├── workers/        # Background workers
│   │   ├── config.py       # Configuration
│   │   ├── dependencies.py # FastAPI dependencies
│   │   └── main.py         # Application entry point
│   ├── tests/              # Test suite
│   ├── Dockerfile          # Backend Docker image
│   └── requirements.txt    # Python dependencies
│
├── frontend/               # Next.js frontend
│   ├── app/                # Next.js app directory
│   │   ├── page.tsx        # Home/upload page
│   │   ├── jobs/           # Jobs page
│   │   ├── results/        # Results page
│   │   ├── layout.tsx      # Root layout
│   │   └── globals.css     # Global styles
│   ├── components/         # React components
│   ├── lib/                # Utility functions
│   ├── __tests__/          # Test suite
│   ├── public/             # Static assets
│   ├── Dockerfile          # Frontend Docker image
│   └── package.json        # npm dependencies
│
├── docs/                   # Documentation
│   ├── architecture/       # Architecture docs
│   ├── guides/             # User guides
│   ├── api/                # API documentation
│   ├── deployment/         # Deployment guides
│   └── knowledge-transfer/ # Knowledge transfer docs
│
├── models/                 # Whisper model cache
├── temp/                   # Temporary file storage
│   ├── uploads/            # Uploaded files
│   └── processed/          # Processed audio files
│
├── scripts/                # Utility scripts
├── docker-compose.yml      # Docker Compose configuration
├── .env.example            # Environment template
├── TESTING.md              # Testing guide
├── README.md               # Main README
└── run-all-tests.sh        # Test runner script
```

## Backend Deep Dive

### Directory Structure

```
backend/app/
├── api/                    # API Layer
│   └── v1/
│       ├── __init__.py
│       ├── upload.py       # File upload endpoint
│       ├── jobs.py         # Job management endpoints
│       └── transcriptions.py # Transcription endpoints
│
├── db/                     # Data Layer
│   ├── __init__.py
│   ├── models.py           # SQLAlchemy models
│   └── session.py          # Database session management
│
├── schemas/                # Data Validation
│   ├── __init__.py
│   ├── upload.py           # Upload request/response schemas
│   ├── job.py              # Job schemas
│   └── transcription.py    # Transcription schemas
│
├── services/               # Business Logic
│   ├── file_service.py     # File handling
│   ├── job_service.py      # Job management
│   ├── queue_service.py    # RabbitMQ interaction
│   ├── transcription/      # Transcription providers
│   │   ├── base.py         # Base provider class
│   │   ├── whisper.py      # Local Whisper
│   │   ├── groq.py         # Groq API
│   │   ├── deepgram.py     # Deepgram API
│   │   └── factory.py      # Provider factory
│   └── translation/        # Translation providers
│       ├── base.py
│       ├── openai.py
│       ├── gemini.py
│       └── factory.py
│
├── utils/                  # Utilities
│   ├── audio.py            # Audio processing
│   └── helpers.py          # Helper functions
│
├── workers/                # Background Workers
│   └── consumer.py         # RabbitMQ consumer
│
├── config.py               # Configuration management
├── dependencies.py         # Dependency injection
└── main.py                 # Application entry point
```

### Key Backend Files

#### `main.py` - Application Entry Point
```python
# Creates FastAPI app
# Configures CORS
# Includes API routers
# Sets up database
# Defines startup/shutdown events
```

#### `api/v1/upload.py` - Upload Endpoint
```python
@router.post("/upload")
async def upload_file(...):
    # 1. Validate file
    # 2. Save to disk
    # 3. Create job in DB
    # 4. Publish to queue
    # 5. Return job_id
```

#### `services/transcription/whisper.py` - Whisper Provider
```python
class WhisperProvider(TranscriptionProvider):
    # Uses faster-whisper library
    # Loads model once
    # Processes audio file
    # Returns TranscriptionResult
```

#### `workers/consumer.py` - Background Worker
```python
# Connects to RabbitMQ
# Consumes jobs from queue
# Processes transcription
# Updates job status
# Saves results to DB
```

### Database Models

#### `Job` Model
```python
class Job(Base):
    id: UUID
    status: str  # pending, processing, completed, failed
    job_type: str  # transcription, translation
    provider: str
    model_name: str
    language: str
    original_filename: str
    file_size_bytes: int
    file_path: str
    created_at: datetime
    started_at: datetime
    completed_at: datetime
```

#### `Transcription` Model
```python
class Transcription(Base):
    id: UUID
    job_id: UUID  # FK to Job
    text: str
    language: str
    confidence: float
    word_count: int
    segments: JSON
    processing_time_ms: int
    provider: str
    model_name: str
```

#### `APIKey` Model
```python
class APIKey(Base):
    id: UUID
    key_hash: str  # SHA-256 hash
    name: str
    is_active: bool
    created_at: datetime
    last_used_at: datetime
```

## Frontend Deep Dive

### Directory Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Home/Upload page
│   ├── layout.tsx          # Root layout with nav
│   ├── globals.css         # Global styles
│   ├── jobs/
│   │   └── page.tsx        # Jobs listing page
│   └── results/
│       └── [id]/
│           └── page.tsx    # Result detail page
│
├── components/             # React Components
│   ├── FileUpload.tsx      # Drag & drop upload
│   ├── JobCard.tsx         # Job display card
│   └── TranscriptionView.tsx # Transcription display
│
├── lib/                    # Utilities
│   ├── api.ts              # API client functions
│   └── types.ts            # TypeScript types
│
└── __tests__/              # Tests
    ├── unit/
    └── e2e/
```

### Key Frontend Files

#### `app/page.tsx` - Main Upload Page
```typescript
// State management for upload
// Settings configuration
// File selection
// Upload handling
// Error display
```

#### `components/FileUpload.tsx` - Upload Component
```typescript
// Uses react-dropzone
// Drag & drop handling
// Multiple file support
// File list display
// Upload button
```

#### `lib/api.ts` - API Client
```typescript
// uploadFile()
// getJobs()
// getJob(id)
// getTranscription(id)
// downloadTranscription(id, format)
```

## Data Flow Examples

### Upload Flow

```
1. User selects file
   ↓
2. FileUpload component
   ↓
3. page.tsx handleUpload()
   ↓
4. fetch('/api/v1/upload') with FormData
   ↓
5. Backend: upload.py
   ↓
6. FileService.save_upload()
   ↓
7. JobService.create_job()
   ↓
8. QueueService.publish()
   ↓
9. Return job_id to frontend
   ↓
10. Display success + job link
```

### Processing Flow

```
1. Worker consumes from queue
   ↓
2. Load job from DB
   ↓
3. Update status → processing
   ↓
4. FFmpeg extract audio (if video)
   ↓
5. Load Whisper model
   ↓
6. Transcribe audio
   ↓
7. Create Transcription record
   ↓
8. Update job status → completed
   ↓
9. Clean up temp files
```

### Retrieval Flow

```
1. User polls /api/v1/jobs/{id}
   ↓
2. Backend returns job status
   ↓
3. If completed, get transcription_id
   ↓
4. GET /api/v1/transcriptions/{id}
   ↓
5. Return transcription text
   ↓
6. Display in UI
   ↓
7. Offer download options
```

## Configuration Management

### Environment Variables

**Backend** (`.env`):
```env
# Database
DATABASE_URL=postgresql://...

# Queue
RABBITMQ_URL=amqp://...

# API Keys (optional)
GROQ_API_KEY=...
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...

# Storage
TEMP_UPLOAD_DIR=./temp/uploads
TEMP_PROCESSED_DIR=./temp/processed
MODELS_DIR=./models

# Limits
MAX_FILE_SIZE_MB=500
ALLOWED_EXTENSIONS=wav,mp3,m4a,mp4,...

# Workers
WORKER_CONCURRENCY=4
```

**Frontend** (`next.config.js`):
```javascript
module.exports = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  }
}
```

### Configuration Loading

1. Environment variables (`.env` file)
2. `config.py` loads and validates settings
3. Pydantic Settings for type safety
4. Access via `settings` object

## Code Style & Conventions

### Python (Backend)

- **Style**: PEP 8
- **Formatter**: Black
- **Linter**: Flake8, mypy
- **Async**: async/await throughout
- **Type Hints**: Required for all functions
- **Docstrings**: Google style

Example:
```python
async def create_job(
    db: AsyncSession,
    job_type: str,
    provider: str,
) -> Job:
    """Create a new job.

    Args:
        db: Database session
        job_type: Type of job (transcription, translation)
        provider: Service provider name

    Returns:
        Created job instance
    """
    job = Job(job_type=job_type, provider=provider)
    db.add(job)
    await db.commit()
    return job
```

### TypeScript (Frontend)

- **Style**: Airbnb/Prettier
- **Linter**: ESLint
- **Type Safety**: Strict mode enabled
- **Components**: Functional components with hooks
- **State**: React hooks (useState, useEffect)

Example:
```typescript
interface FileUploadProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
}

export default function FileUpload({ onUpload, isUploading }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  // ...
}
```

## Testing Organization

### Backend Tests
```
tests/
├── conftest.py          # Shared fixtures
├── unit/                # Unit tests
│   ├── test_api_upload.py
│   ├── test_api_jobs.py
│   └── test_api_transcriptions.py
└── e2e/                 # End-to-end tests
    └── test_upload_transcribe_workflow.py
```

### Frontend Tests
```
__tests__/
├── unit/
│   ├── components/
│   │   └── FileUpload.test.tsx
│   └── app/
│       └── page.test.tsx
└── e2e/
    └── upload-workflow.spec.ts
```

## Common Development Tasks

### Add a New Transcription Provider

1. Create `backend/app/services/transcription/myprovider.py`
2. Inherit from `TranscriptionProvider`
3. Implement `transcribe()` method
4. Register in `factory.py`
5. Add configuration to `config.py`
6. Update frontend provider dropdown
7. Write tests

### Add a New API Endpoint

1. Create route in `backend/app/api/v1/myroute.py`
2. Define Pydantic schemas in `schemas/`
3. Implement service logic in `services/`
4. Register router in `main.py`
5. Update API documentation
6. Write tests

### Add a New Frontend Page

1. Create `frontend/app/mypage/page.tsx`
2. Add navigation link in `layout.tsx`
3. Implement UI components
4. Add API client functions in `lib/api.ts`
5. Write tests

## Debugging Tips

### Backend
```bash
# View logs
docker-compose logs backend -f

# Enter container
docker-compose exec backend bash

# Python debugger
import pdb; pdb.set_trace()

# Check database
docker-compose exec postgres psql -U voiceapp
```

### Frontend
```bash
# View logs
docker-compose logs frontend -f

# React DevTools in browser
# Console logging
console.log('Debug:', data)

# Network tab for API calls
```

### Worker
```bash
# View worker logs
docker-compose logs worker -f

# Check queue
# Open http://localhost:15672
# Navigate to Queues tab
```

## Performance Considerations

1. **Database**: Use connection pooling, indexes on foreign keys
2. **Queue**: Monitor queue depth, scale workers
3. **File I/O**: Use async file operations
4. **API**: Implement caching for repeated requests
5. **Frontend**: Lazy load components, optimize images

## Security Best Practices

1. **Never commit** `.env` files or API keys
2. **Always validate** user input (Pydantic schemas)
3. **Use parameterized queries** (SQLAlchemy ORM)
4. **Hash sensitive data** (API keys with SHA-256)
5. **Sanitize file paths** to prevent traversal
6. **Rate limit** API endpoints
7. **Use HTTPS** in production

## Next Steps for New Developers

1. Read this overview
2. Set up development environment
3. Run the application locally
4. Run the test suite
5. Make a small change
6. Read specific component docs
7. Ask questions!

---

**For more details, see:**
- [Architecture](../architecture/SYSTEM_ARCHITECTURE.md)
- [Getting Started](../guides/GETTING_STARTED.md)
- [Testing Guide](../guides/TESTING_GUIDE.md)
