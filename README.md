# Voice App - Speech-to-Text Microservice

A modern web application for audio/video transcription and translation with bulk upload support and queue-based processing.

## Features

- **Transcription**: Convert audio/video files to text
  - Local Whisper models (free, offline)
  - Groq cloud API (fast, accurate)
  - Deepgram cloud API (high quality)
- **Translation**: Translate transcriptions to other languages
  - OpenAI GPT (gpt-4o-mini)
  - Google Gemini (gemini-2.0-flash)
- **Video Support**: Automatic audio extraction from video files
- **Bulk Processing**: Upload multiple files with queue-based processing
- **Real-time Status**: Track job progress and status
- **Multiple Formats**: Download results as TXT, JSON, or SRT

## Architecture

```
Frontend (Next.js 14)
    ↓
Backend (FastAPI)
    ↓
RabbitMQ Queue → Worker Processes
    ↓
PostgreSQL Database
```

**Key Components:**
- **Next.js Frontend**: Minimal UI for upload, job monitoring, and results
- **FastAPI Backend**: RESTful API for file upload and job management
- **RabbitMQ**: Message queue for async job processing
- **PostgreSQL**: Metadata storage
- **Worker**: Background processor for transcription tasks
- **FFmpeg**: Audio/video processing

## Quick Start

### Prerequisites

- Docker & Docker Compose
- (Optional) API keys for cloud providers:
  - Groq: https://console.groq.com
  - Deepgram: https://console.deepgram.com
  - OpenAI: https://platform.openai.com
  - Google Gemini: https://ai.google.dev

### 1. Clone and Setup

```bash
cd /Users/gauravporwal/Sites/projects/rnd/voice-app

# Copy environment file
cp .env.example .env

# Edit .env and add your API keys (optional)
nano .env
```

### 2. Start Services

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f worker
```

Services will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)

### 3. Create an API Key

```bash
# Enter the backend container
docker-compose exec backend bash

# Run Python to create an API key
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
        api_key = APIKey(
            key_hash=key_hash,
            name="Default Key",
            is_active=True
        )
        db.add(api_key)
        await db.commit()

    print(f"\nAPI Key created successfully!")
    print(f"API Key: {key}")
    print(f"\nSave this key - it won't be shown again!")

asyncio.run(create_key())
EOF
```

Save the generated API key - you'll need it to use the application.

### 4. Use the Application

1. Open http://localhost:3000
2. Enter your API key
3. Configure provider and model
4. Upload audio/video files
5. View jobs at http://localhost:3000/jobs
6. View results when completed

## Manual Setup (Without Docker)

### Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up database
export DATABASE_URL="postgresql://user:pass@localhost:5432/voiceapp"
export RABBITMQ_URL="amqp://guest:guest@localhost:5672/"

# Run migrations (create tables)
python -c "from app.main import app; import asyncio; from app.db.session import engine, Base; asyncio.run(engine.begin().__aenter__().run_sync(Base.metadata.create_all))"

# Start backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# In another terminal, start worker
python -m app.workers.consumer
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## API Documentation

### Authentication

All requests require an API key in the header:

```bash
curl -H "X-API-Key: your_api_key_here" http://localhost:8000/api/v1/jobs
```

### Upload File

```bash
curl -X POST http://localhost:8000/api/v1/upload \
  -H "X-API-Key: your_api_key" \
  -F "file=@audio.mp3" \
  -F "provider=whisper" \
  -F "model_name=base" \
  -F "language=en"
```

### Get Job Status

```bash
curl http://localhost:8000/api/v1/jobs/{job_id} \
  -H "X-API-Key: your_api_key"
```

### List Jobs

```bash
curl http://localhost:8000/api/v1/jobs \
  -H "X-API-Key: your_api_key"
```

### Get Transcription

```bash
curl http://localhost:8000/api/v1/transcriptions/{transcription_id} \
  -H "X-API-Key: your_api_key"
```

### Translate Transcription

```bash
curl -X POST http://localhost:8000/api/v1/transcriptions/{id}/translate \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"target_language": "es", "provider": "openai"}'
```

### Download Transcription

```bash
# As TXT
curl http://localhost:8000/api/v1/transcriptions/{id}/download?format=txt \
  -H "X-API-Key: your_api_key" -o transcription.txt

# As JSON
curl http://localhost:8000/api/v1/transcriptions/{id}/download?format=json \
  -H "X-API-Key: your_api_key" -o transcription.json

# As SRT (subtitles)
curl http://localhost:8000/api/v1/transcriptions/{id}/download?format=srt \
  -H "X-API-Key: your_api_key" -o transcription.srt
```

## Configuration

Edit `.env` to configure:

```env
# Transcription Providers
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key

# Translation Providers
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key

# File Limits
MAX_FILE_SIZE_MB=500
ALLOWED_EXTENSIONS=wav,mp3,m4a,mp4,mov,avi,mkv,webm,ogg,flac

# Worker Settings
WORKER_CONCURRENCY=4

# Cleanup
TEMP_FILE_TTL_HOURS=24
```

## Supported Formats

**Audio**: WAV, MP3, M4A, OGG, FLAC
**Video**: MP4, MOV, AVI, MKV, WebM

All files are automatically converted to 16kHz mono WAV for transcription.

## Whisper Models

Local Whisper models are downloaded on first use:

| Model | Size | Speed | Accuracy | RAM |
|-------|------|-------|----------|-----|
| tiny | 75 MB | Fastest | Low | 0.3 GB |
| base | 142 MB | Fast | Good | 0.5 GB |
| small | 491 MB | Moderate | High | 1.0 GB |
| medium | 1.5 GB | Slow | Very High | 2.0 GB |
| large-v3 | 2.9 GB | Slowest | Best | 3.9 GB |
| large-v3-turbo | 1.5 GB | Moderate | Near-Best | 1.8 GB |

Models are cached in `./models/` directory.

## Troubleshooting

### Database Connection Error

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Worker Not Processing Jobs

```bash
# Check worker logs
docker-compose logs worker

# Check RabbitMQ
docker-compose logs rabbitmq

# Restart worker
docker-compose restart worker
```

### FFmpeg Not Found

Make sure FFmpeg is installed in the Docker container (already included in Dockerfile).

### Model Download Fails

Check internet connection and HuggingFace availability. Models are downloaded from:
```
https://huggingface.co/ggerganov/whisper.cpp/resolve/main/
```

## Development

### Project Structure

```
voice-app/
├── backend/              # FastAPI microservice
│   ├── app/
│   │   ├── api/         # API endpoints
│   │   ├── db/          # Database models
│   │   ├── services/    # Business logic
│   │   ├── workers/     # Background jobs
│   │   └── main.py      # App entry
│   └── requirements.txt
├── frontend/            # Next.js UI
│   ├── app/            # Pages (App Router)
│   ├── components/     # React components
│   └── lib/            # API client
├── temp/               # Temporary files
├── models/             # Whisper models
└── docker-compose.yml
```

### Adding New Transcription Provider

1. Create new provider class in `backend/app/services/transcription/`
2. Inherit from `TranscriptionProvider`
3. Implement `transcribe()` and `is_available()` methods
4. Register in `factory.py`

Example:

```python
from app.services.transcription.base import TranscriptionProvider, TranscriptionResult

class MyProvider(TranscriptionProvider):
    name = "myprovider"

    async def is_available(self) -> bool:
        return bool(settings.my_api_key)

    async def transcribe(self, audio_path, model=None, language=None):
        # Your implementation
        return TranscriptionResult(text="...", provider=self.name)

# In factory.py
TranscriptionFactory.register_provider("myprovider", MyProvider)
```

## License

MIT

## Support

For issues and questions, please create an issue in the GitHub repository.
