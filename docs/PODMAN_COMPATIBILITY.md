# Podman Compatibility Notes

This document describes Podman-specific configuration required for the Docker development and testing infrastructure.

## Overview

The Voice App Docker infrastructure has been tested and verified to work with **Podman 5.7.0** and **podman-compose** on macOS. However, some adjustments are required compared to Docker Desktop due to differences in how Podman handles file system events on macOS.

## Known Issues & Workarounds

### 1. File System Event Notifications (Hot Reload)

**Issue**: On macOS, Podman runs containers in a Linux VM (using QEMU/HVF). File system event notifications (FSEvents on macOS) don't propagate through the virtualization layer to containers. This causes file watchers (uvicorn, webpack) to not detect file changes even though the files sync correctly via bind mounts.

**Symptoms**:
- Code changes appear in containers (verified with `podman exec`)
- File watchers don't trigger automatic reloads
- Manual rebuilds are required for changes to take effect

**Solution**: Enable polling-based file watching instead of event-based watching.

#### Backend (Python/uvicorn)

**File**: `docker-compose.override.yml`

```yaml
services:
  backend:
    environment:
      - WATCHFILES_FORCE_POLLING=true
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-delay 2
```

- `WATCHFILES_FORCE_POLLING=true`: Forces uvicorn to use polling instead of inotify
- `--reload-delay 2`: Adds 2-second delay to prevent rapid reload cycles

**Test**: Edit `/backend/app/main.py` → logs should show "WatchFiles detected changes... Reloading..."

#### Frontend (Next.js/webpack)

**File**: `frontend/next.config.js`

```javascript
module.exports = {
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,          // Check for changes every second
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};
```

**Test**: Edit `/frontend/app/page.tsx` or `/frontend/app/api/v1/jobs/route.ts` → logs should show "✓ Compiled in XXXms"

### 2. podman-compose Limitations

**Issue**: `podman-compose` has some command limitations compared to `docker-compose`.

#### Service-specific restart not supported

**Error**:
```bash
podman-compose restart backend
# Error: unrecognized arguments: backend
```

**Workaround**: Use `stop` then `start` instead:
```bash
podman-compose stop
podman-compose start
```

Or restart all services:
```bash
podman-compose down && podman-compose up -d
```

#### Logs don't support multiple containers remotely

**Error**:
```bash
podman-compose logs backend worker frontend
# Error: logs does not support multiple containers when run remotely
```

**Workaround**: Check logs for each service individually:
```bash
podman-compose logs backend
podman-compose logs worker
podman-compose logs frontend
```

### 3. Container Cleanup

**Issue**: Sometimes containers aren't fully cleaned up, causing "container already exists" errors.

**Symptoms**:
```
Error: container has dependent containers which must be removed before it
Error: the container name "X" is already in use
```

**Solution**: Full cleanup sequence:
```bash
podman-compose down
sleep 2
podman-compose up -d
```

For test environments:
```bash
podman-compose -f docker-compose.test.yml down
podman-compose -f docker-compose.test.yml up --abort-on-container-exit backend_unit_tests
```

## Verified Features

✅ **Hot Reload** - Works with polling-based file watching
✅ **Bind Mounts** - Files sync correctly (read-only and read-write)
✅ **Named Volumes** - Works for node_modules preservation
✅ **tmpfs** - In-memory databases work for fast tests
✅ **Health Checks** - Service dependencies work correctly
✅ **Multi-stage Builds** - All targets (development, test, production) build successfully
✅ **Test Infrastructure** - docker-compose.test.yml works with tmpfs database

## Performance Notes

### Hot Reload Timing

- **Backend (Python)**: ~2-4 seconds (polling interval + reload delay)
- **Frontend (Next.js)**: ~1-2 seconds (1000ms poll + 300ms aggregation)

Polling-based watching is slightly slower than event-based (~500ms-1s delay), but this is acceptable for development and much better than manual rebuilds.

### Test Execution

- **tmpfs database**: Works correctly, provides ~10x speed improvement over disk-based tests
- **Parallel test execution**: Supported with `--abort-on-container-exit`

## Recommended Development Workflow

### Starting Development Environment

```bash
# Start all services with hot reload
podman-compose up -d

# Check status
podman-compose ps

# View logs (pick services you want to monitor)
podman-compose logs -f backend
```

### Making Code Changes

1. Edit Python/TypeScript files as normal
2. Wait 2-4 seconds for auto-reload (backend) or 1-2 seconds (frontend)
3. Check logs to confirm reload: `podman-compose logs --tail=20 backend`

### Running Tests

```bash
# All backend unit tests
podman-compose -f docker-compose.test.yml run --rm backend_unit_tests

# Specific test file
podman-compose -f docker-compose.test.yml run --rm backend_unit_tests \
  pytest tests/unit/test_whisper_caching.py -v

# All tests in parallel
podman-compose -f docker-compose.test.yml up --abort-on-container-exit
```

### Cleanup

```bash
# Stop development services
podman-compose down

# Clean up test services
podman-compose -f docker-compose.test.yml down

# Remove all containers and volumes (nuclear option)
podman-compose down -v
```

## Troubleshooting

### Hot Reload Not Working

1. **Verify polling is enabled**:
   ```bash
   # Backend
   podman exec voice-app_backend_1 env | grep WATCHFILES
   # Should show: WATCHFILES_FORCE_POLLING=true
   ```

2. **Check file sync**:
   ```bash
   # Make a change to main.py, then verify it's in the container
   podman exec voice-app_backend_1 head -5 /app/app/main.py
   ```

3. **Monitor logs for reload messages**:
   ```bash
   podman logs -f voice-app_backend_1 | grep -i reload
   ```

### Tests Failing to Connect to Database

1. **Ensure postgres_test is healthy**:
   ```bash
   podman-compose -f docker-compose.test.yml ps postgres_test
   # STATUS should show "Up X seconds (healthy)"
   ```

2. **Run tests with full stack** (not just `run`):
   ```bash
   podman-compose -f docker-compose.test.yml up --abort-on-container-exit backend_unit_tests
   ```

### Container Name Conflicts

```bash
# Full cleanup
podman-compose down
podman-compose -f docker-compose.test.yml down

# Verify all stopped
podman ps -a | grep voice-app

# Start fresh
podman-compose up -d
```

## Compatibility Matrix

| Feature | Docker Desktop | Podman 5.7.0 | Notes |
|---------|---------------|--------------|-------|
| Bind Mounts | ✅ | ✅ | Works identically |
| File Events | ✅ Native | ⚠️ Polling Required | Requires config changes |
| Health Checks | ✅ | ✅ | Works identically |
| tmpfs Volumes | ✅ | ✅ | Works identically |
| Multi-stage Builds | ✅ | ✅ | Works identically |
| BuildKit Cache | ✅ | ✅ | Works identically |
| Service Restart | ✅ | ⚠️ All services only | Use stop/start for individual |
| Multi-container Logs | ✅ | ❌ Remote limitation | Check one at a time |

## Migration from Docker Desktop

If switching from Docker Desktop to Podman:

1. **Install Podman Desktop** or `brew install podman podman-compose`

2. **Update docker-compose.override.yml** with polling configuration:
   - Add `WATCHFILES_FORCE_POLLING=true` to backend environment
   - Add `--reload-delay 2` to backend command

3. **Update frontend/next.config.js** with webpack watchOptions (see above)

4. **Test hot reload**:
   ```bash
   podman-compose up -d
   # Edit a file, verify reload in logs
   ```

5. **Update any scripts** that use `docker-compose restart <service>`:
   ```bash
   # Before (Docker)
   docker-compose restart backend

   # After (Podman)
   podman-compose stop
   podman-compose start
   ```

## References

- **Podman**: https://podman.io/
- **podman-compose**: https://github.com/containers/podman-compose
- **watchfiles**: https://watchfiles.helpmanual.io/
- **Next.js webpack config**: https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config

## Version Information

This documentation is based on testing with:
- **Podman**: 5.7.0
- **podman-compose**: Latest
- **macOS**: Version with QEMU/HVF virtualization
- **Project**: Voice App (Python 3.11, Next.js 14)

Last updated: 2026-01-06
