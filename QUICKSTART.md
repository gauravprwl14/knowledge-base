# Voice App - Quick Start Guide

Get up and running in 5 minutes!

## Step 1: Start Services (1 minute)

```bash
cd voice-app

# Copy environment file
cp .env.example .env

# Start all services
docker-compose up -d

# Wait for services to start (30 seconds)
docker-compose logs -f backend
# Press Ctrl+C when you see "Application startup complete"
```

## Step 2: Create API Key (1 minute)

```bash
# Enter backend container
docker-compose exec backend bash

# Create API key
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
        api_key = APIKey(key_hash=key_hash, name="My local Dev Key", is_active=True)
        db.add(api_key)
        await db.commit()
    print(f"\n✓ API Key: {key}\n")

asyncio.run(create_key())
EOF

# Exit container
exit
```

**SAVE THE API KEY!** You'll need it to use the app.

## Step 3: Open Application (30 seconds)

1. Open browser: http://localhost:3000
2. Paste your API key in the "API Key" field
3. Select provider (start with "Whisper (Local)" - it's free!)
4. Select model (start with "Base")

## Step 4: Upload & Transcribe (2 minutes)

1. Drag & drop an audio/video file (or click to select)
2. Click "Upload"
3. Go to "Jobs" tab to see progress
4. When complete, click "View Result" to see transcription

## That's It! 🎉

You now have a fully functional speech-to-text service running locally.

## Next Steps

### Add Cloud Providers (Optional)

Edit `.env` and add API keys:

```bash
# For faster cloud transcription
GROQ_API_KEY=your_key_here          # Get from: https://console.groq.com
DEEPGRAM_API_KEY=your_key_here      # Get from: https://console.deepgram.com

# For translation
OPENAI_API_KEY=your_key_here        # Get from: https://platform.openai.com
GEMINI_API_KEY=your_key_here        # Get from: https://ai.google.dev
```

Then restart:
```bash
docker-compose restart backend worker
```

### Test the API

```bash
# Check health
curl http://localhost:8000/health

# List models
curl http://localhost:8000/api/v1/models

# Upload a file
curl -X POST http://localhost:8000/api/v1/upload \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "file=@test_audio.mp3" \
  -F "provider=whisper" \
  -F "model_name=base"
```

### View Services

- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs (interactive Swagger UI)
- **RabbitMQ**: http://localhost:15672 (user: guest, pass: guest)

## Common Issues

### "Database connection failed"
```bash
docker-compose restart postgres
# Wait 10 seconds, then:
docker-compose restart backend worker
```

### "No API key found"
Make sure you saved the API key from Step 2 and entered it correctly.

### Worker not processing
```bash
docker-compose logs worker
docker-compose restart worker
```

## Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove all data (CAUTION!)
docker-compose down -v
```

## Need Help?

- Check full README: `cat README.md`
- View logs: `docker-compose logs -f [service]`
- API documentation: http://localhost:8000/docs
