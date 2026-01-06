# Getting Started with Voice App

This guide will help you get the Voice App up and running in under 10 minutes.

## Prerequisites

- **Docker & Docker Compose** (or Podman & Podman Compose)
- **Git**
- (Optional) API keys for cloud providers:
  - Groq: https://console.groq.com
  - Deepgram: https://console.deepgram.com
  - OpenAI: https://platform.openai.com
  - Google Gemini: https://ai.google.dev

## Quick Start (Docker Compose)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd voice-app
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your API keys (optional - Whisper works without keys)
nano .env
```

**Minimal .env for local Whisper:**
```env
# Database
DATABASE_URL=postgresql://voiceapp:voiceapp@postgres:5432/voiceapp

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/

# Storage
TEMP_UPLOAD_DIR=./temp/uploads
TEMP_PROCESSED_DIR=./temp/processed
MODELS_DIR=./models
```

### 3. Start All Services

```bash
# Using Docker Compose
docker-compose up -d

# Or using Podman Compose
podman-compose up -d
```

This will start:
- PostgreSQL (port 5432)
- RabbitMQ (ports 5672, 15672)
- Backend API (port 8000)
- Worker (background)
- Frontend (port 3000)

### 4. Verify Services

```bash
# Check service status
docker-compose ps

# Should show all services as "Up" and "healthy"
```

### 5. Create an API Key

```bash
# Enter backend container
docker-compose exec backend bash

# Run Python script to create API key
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
            name="My First Key",
            is_active=True
        )
        db.add(api_key)
        await db.commit()

    print(f"\n✅ API Key created successfully!")
    print(f"API Key: {key}")
    print(f"\n⚠️  Save this key - it won't be shown again!\n")

asyncio.run(create_key())
EOF

# Exit container
exit
```

**Save the API key** - you'll need it to use the application!

### 6. Access the Application

Open your browser and navigate to:

- **Frontend**: http://localhost:3000
- **Backend API Docs**: http://localhost:8000/docs
- **RabbitMQ Management**: http://localhost:15672 (user: guest, password: guest)

### 7. Upload Your First File

1. Open http://localhost:3000
2. Enter your API key
3. Select provider (Whisper for offline use)
4. Choose model (Base or Tiny for quick testing)
5. Drag & drop an audio/video file or click to select
6. Click "Upload"
7. Go to "Jobs" page to see processing status
8. View results when completed

## Test the API (cURL)

### Upload a File

```bash
curl -X POST http://localhost:8000/api/v1/upload \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -F "file=@/path/to/audio.mp3" \
  -F "provider=whisper" \
  -F "model_name=base" \
  -F "language=en"
```

Response:
```json
{
  "job_id": "abc-123-def-456",
  "filename": "audio.mp3",
  "status": "pending",
  "message": "File uploaded successfully"
}
```

### Check Job Status

```bash
curl http://localhost:8000/api/v1/jobs/abc-123-def-456 \
  -H "X-API-Key: YOUR_API_KEY_HERE"
```

### Get Transcription

```bash
# List transcriptions
curl http://localhost:8000/api/v1/transcriptions \
  -H "X-API-Key: YOUR_API_KEY_HERE"

# Download as TXT
curl http://localhost:8000/api/v1/transcriptions/TRANSCRIPTION_ID/download?format=txt \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -o transcription.txt
```

## Manual Setup (Without Docker)

If you prefer not to use Docker:

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install FFmpeg
# macOS: brew install ffmpeg
# Ubuntu: sudo apt-get install ffmpeg
# Windows: Download from ffmpeg.org

# Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost:5432/voiceapp"
export RABBITMQ_URL="amqp://guest:guest@localhost:5672/"

# Create database tables
python -c "
from app.main import app
import asyncio
from app.db.session import engine, Base

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(init_db())
"

# Start backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

### Worker Setup

```bash
cd backend
source venv/bin/activate

# Start worker
python -m app.workers.consumer
```

## Verify Installation

### 1. Check Backend Health

```bash
curl http://localhost:8000/docs
```

Should return the Swagger UI HTML.

### 2. Check Frontend

```bash
curl http://localhost:3000
```

Should return the Next.js page HTML.

### 3. Check RabbitMQ

Open http://localhost:15672 and login with guest/guest.

### 4. Check Database

```bash
# Using Docker
docker-compose exec postgres psql -U voiceapp -d voiceapp -c "\dt"

# Should list tables: api_keys, jobs, transcriptions, translations
```

### 5. Check Worker

```bash
# View worker logs
docker-compose logs worker -f

# Should show: "Worker started. Waiting for messages..."
```

## Troubleshooting

### Services Not Starting

```bash
# Check logs
docker-compose logs

# Restart services
docker-compose restart

# Rebuild if needed
docker-compose build --no-cache
```

### Database Connection Error

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View database logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Worker Not Processing

```bash
# Check worker logs
docker-compose logs worker

# Check RabbitMQ
docker-compose logs rabbitmq

# Restart worker
docker-compose restart worker
```

### Port Already in Use

```bash
# Find process using port
lsof -i :3000  # or :8000, :5432, etc.

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
```

### Model Download Fails

Whisper models download from HuggingFace on first use. If download fails:

1. Check internet connection
2. Try again (temporary HuggingFace issues)
3. Manually download model to `./models/` directory

## Next Steps

✅ **Application is running!**

Now you can:

1. **Explore the API**: http://localhost:8000/docs
2. **Upload files**: http://localhost:3000
3. **Monitor jobs**: http://localhost:3000/jobs
4. **Read the docs**: Check `/docs` folder
5. **Run tests**: See `TESTING.md`

## Configuration Options

See `docs/guides/CONFIGURATION.md` for detailed configuration options including:

- Transcription providers
- Translation providers
- File size limits
- Worker concurrency
- Cleanup policies

## Common Use Cases

### 1. Transcribe Single Audio File

```bash
# Upload
curl -X POST http://localhost:8000/api/v1/upload \
  -H "X-API-Key: YOUR_KEY" \
  -F "file=@interview.mp3" \
  -F "provider=whisper" \
  -F "model_name=base"

# Get result
curl http://localhost:8000/api/v1/transcriptions/TRANS_ID/download?format=txt \
  -H "X-API-Key: YOUR_KEY"
```

### 2. Batch Process Multiple Files

```bash
for file in *.mp3; do
  curl -X POST http://localhost:8000/api/v1/upload \
    -H "X-API-Key: YOUR_KEY" \
    -F "file=@$file" \
    -F "provider=whisper" \
    -F "model_name=tiny"
done
```

### 3. Extract Video Audio & Transcribe

```bash
# Just upload the video - FFmpeg extracts audio automatically
curl -X POST http://localhost:8000/api/v1/upload \
  -H "X-API-Key: YOUR_KEY" \
  -F "file=@video.mp4" \
  -F "provider=whisper" \
  -F "model_name=base"
```

### 4. Transcribe & Translate

```bash
# 1. Transcribe
curl -X POST http://localhost:8000/api/v1/upload \
  -H "X-API-Key: YOUR_KEY" \
  -F "file=@audio.mp3" \
  -F "provider=whisper"

# 2. Translate (after transcription completes)
curl -X POST http://localhost:8000/api/v1/transcriptions/TRANS_ID/translate \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_language": "es", "provider": "openai"}'
```

## Support

- **Documentation**: `/docs` folder
- **API Docs**: http://localhost:8000/docs
- **Issues**: GitHub Issues
- **Tests**: See `TESTING.md`

---

**You're all set! Happy transcribing! 🎉**
