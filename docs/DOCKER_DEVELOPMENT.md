# Docker Development Guide

This guide explains how to use the Docker development environment with hot reload capabilities, eliminating the need for rebuilds during development.

## Quick Start

Start all services in development mode with hot reload:

```bash
docker-compose up -d
```

That's it! The `docker-compose.override.yml` file is automatically loaded and configures hot reload for all services.

## What's Different in Development Mode?

### Hot Reload Enabled

When you edit code:
- **Backend (Python)**: Uvicorn detects changes and reloads automatically in 1-2 seconds
- **Frontend (Next.js)**: Next.js Fast Refresh updates the browser instantly
- **Worker/Dispatcher**: Python auto-reload enabled

### Source Code Bind Mounts

Your local source code is mounted into containers as read-only volumes:

```yaml
backend:
  volumes:
    - ./backend/app:/app/app:ro      # Read-only bind mount
    - ./backend/tests:/app/tests:ro
```

This means:
- ✅ Code changes reflect immediately (no rebuild)
- ✅ IDE changes sync to container
- ✅ Safe (read-only prevents container from modifying source)

### Database Exposed

PostgreSQL port 5432 is exposed to localhost, allowing you to use GUI tools:
- **DBeaver**: Connect to `localhost:5432`
- **TablePlus**: Connect to `localhost:5432`
- **pgAdmin**: Connect to `localhost:5432`

**Credentials**:
- User: `voiceapp`
- Password: `voiceapp`
- Database: `voiceapp`

## Common Development Commands

### Start Services

```bash
# Start all services in background
docker-compose up -d

# Start with logs visible
docker-compose up

# Start specific service
docker-compose up -d backend
```

### View Logs

```bash
# Follow all logs
docker-compose logs -f

# Follow specific service logs
docker-compose logs -f backend
docker-compose logs -f worker
docker-compose logs -f frontend

# View last 100 lines
docker-compose logs --tail=100 backend
```

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart backend
docker-compose restart worker
```

### Stop Services

```bash
# Stop all services (preserves volumes)
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Rebuild Images

Only needed when:
- Dependencies change (`requirements.txt`, `package.json`)
- Dockerfile changes
- System dependencies change

```bash
# Rebuild all services
docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build backend
```

## Hot Reload in Action

### Backend Hot Reload

1. Edit a Python file:
   ```bash
   vim backend/app/main.py
   # Add a comment or change code
   ```

2. Watch logs for reload:
   ```bash
   docker-compose logs -f backend
   ```

3. You'll see:
   ```
   INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
   INFO:     Started reloader process [12] using WatchFiles
   INFO:     Started server process [14]
   INFO:     Waiting for application startup.
   INFO:     Application startup complete.
   WARNING:  WatchFiles detected changes in 'app/main.py'. Reloading...
   INFO:     Shutting down
   INFO:     Finished server process [14]
   INFO:     Started server process [15]
   INFO:     Waiting for application startup.
   INFO:     Application startup complete.
   ```

**Time from save to reload**: ~1-2 seconds

### Frontend Hot Reload

1. Edit a React component:
   ```bash
   vim frontend/app/page.tsx
   # Change some text
   ```

2. Browser updates automatically with Next.js Fast Refresh

**Time from save to browser update**: ~1-2 seconds (instant on Linux, 1-2s on macOS)

### Worker/Dispatcher Auto-Reload

Worker and dispatcher services also have hot reload enabled. When you change:
- `backend/app/workers/consumer.py`
- `backend/app/workers/job_dispatcher.py`
- Any imported modules

The services automatically restart.

## Debugging Inside Containers

### Execute Commands in Running Containers

```bash
# Open shell in backend container
docker-compose exec backend bash

# Run Python REPL
docker-compose exec backend python

# Check installed packages
docker-compose exec backend pip list

# Test database connection
docker-compose exec backend python -c "from app.db.session import engine; print(engine)"
```

### Attach to Running Process

```bash
# Attach to backend logs (Ctrl+C to detach)
docker-compose logs -f backend

# Stream all logs with timestamps
docker-compose logs -f --timestamps
```

### Inspect Container State

```bash
# View running containers
docker-compose ps

# View container resource usage
docker stats

# Inspect container details
docker inspect voice-app-backend-1
```

## macOS Performance Tips

### Enable VirtioFS (Recommended)

Docker Desktop 4.6+ uses VirtioFS by default, which is significantly faster than osxfs.

**Check your setting**:
1. Open Docker Desktop
2. Go to **Settings → General**
3. Ensure "Use the new Virtualization framework" is checked
4. Ensure "VirtioFS" is selected as the file sharing implementation

### Expected Performance on macOS

- **Hot reload**: 1-2 seconds (vs instant on Linux)
- **npm install**: ~30% slower than Linux
- **File sync**: May have slight latency

This is normal due to how Docker Desktop works on macOS. The bind mounts are still **much faster** than rebuilding (which takes 2-3 minutes).

### Fallback: Native Development

If bind mount performance is unacceptable, you can run services natively:

```bash
# Backend (native)
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt
uvicorn app.main:app --reload --port 8000

# Frontend (native)
cd frontend
npm install
npm run dev
```

Keep Postgres and RabbitMQ in Docker:
```bash
docker-compose up -d postgres rabbitmq
```

## Troubleshooting

### Code Changes Not Reflecting

**Symptom**: You edit code but nothing changes in the running service.

**Solutions**:

1. **Check logs for reload indication**:
   ```bash
   docker-compose logs -f backend
   ```
   Look for "Reloading..." messages.

2. **Verify bind mount is working**:
   ```bash
   docker-compose exec backend ls -la /app/app
   ```
   Ensure files are present and timestamps match your edits.

3. **Restart the service**:
   ```bash
   docker-compose restart backend
   ```

4. **Check for syntax errors**:
   ```bash
   docker-compose logs backend | grep -i error
   ```

### Permission Issues

**Symptom**: "Permission denied" errors when accessing files.

**Solution**: Bind mounts are read-only (`:ro`). This is intentional. If you need to write files, use the temp directories which are mounted read-write:
- `./temp` → `/app/temp`
- `./models` → `/app/models`

### Port Already in Use

**Symptom**: "Bind for 0.0.0.0:5432 failed: port is already allocated"

**Solution**:

1. Check what's using the port:
   ```bash
   lsof -i :5432
   ```

2. Stop the conflicting service or change the port in `docker-compose.override.yml`:
   ```yaml
   postgres:
     ports:
       - "5433:5432"  # Use different host port
   ```

### Node Modules Out of Sync

**Symptom**: Frontend fails to start with module not found errors.

**Solution**: Delete the anonymous volume and rebuild:
```bash
docker-compose down -v
docker-compose up -d --build frontend
```

The anonymous volume (`/app/node_modules`) will be recreated.

### Database Connection Refused

**Symptom**: Backend can't connect to Postgres.

**Solution**:

1. Check Postgres is healthy:
   ```bash
   docker-compose ps postgres
   ```
   Status should show "healthy".

2. Wait for healthcheck:
   ```bash
   docker-compose up -d postgres
   sleep 10
   docker-compose up -d backend
   ```

3. Check Postgres logs:
   ```bash
   docker-compose logs postgres
   ```

## Volume Management

### List Volumes

```bash
docker volume ls
```

### Inspect Volume

```bash
docker volume inspect voice-app_postgres_data
docker volume inspect voice-app_rabbitmq_data
```

### Clean Up Volumes

```bash
# Remove all stopped containers and volumes
docker-compose down -v

# Prune all unused volumes (caution!)
docker volume prune
```

### Backup Volumes

```bash
# Backup Postgres data
docker-compose exec postgres pg_dump -U voiceapp voiceapp > backup.sql

# Restore Postgres data
docker-compose exec -T postgres psql -U voiceapp voiceapp < backup.sql
```

## Environment Variables

Development environment variables are set in:
1. `.env` (if exists)
2. `docker-compose.yml` (defaults)
3. `docker-compose.override.yml` (development-specific)

**Example `.env` file**:
```env
GROQ_API_KEY=your_groq_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
OPENAI_API_KEY=your_openai_key_here
GEMINI_API_KEY=your_gemini_key_here
API_KEY=your_frontend_api_key_here
```

## Network Access

### Service URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)
- **PostgreSQL**: localhost:5432 (voiceapp/voiceapp)

### Inter-Service Communication

Services communicate via Docker network using service names:
- Backend → Postgres: `postgres:5432`
- Backend → RabbitMQ: `rabbitmq:5672`
- Frontend → Backend: `backend:8000`

## Best Practices

### Do's ✅

- ✅ Use `docker-compose up -d` for normal development
- ✅ Check logs with `docker-compose logs -f` when debugging
- ✅ Restart services when config changes: `docker-compose restart`
- ✅ Use database GUI tools (TablePlus, DBeaver) for inspection
- ✅ Keep dependencies up-to-date in lock files

### Don'ts ❌

- ❌ Don't rebuild for code changes (hot reload handles it)
- ❌ Don't run `docker-compose build` unless dependencies change
- ❌ Don't modify files inside containers (use bind mounts)
- ❌ Don't commit `.env` files with secrets
- ❌ Don't use `docker-compose.prod.yml` for development

## Migration from Old Workflow

### Old Workflow (Rebuild Every Change)

```bash
vim backend/app/main.py
docker-compose build backend          # 2-3 minutes
docker-compose up -d backend
# Test change
```

**Total time per change**: 2-3 minutes

### New Workflow (Hot Reload)

```bash
vim backend/app/main.py
# That's it! Change reflects in 1-2 seconds
# Test change
```

**Total time per change**: 1-2 seconds (99% faster!)

## Next Steps

- Read [DOCKER_TESTING.md](./DOCKER_TESTING.md) for testing workflows
- Read [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- Check [CLAUDE.md](../CLAUDE.md) for project-specific commands
