# Next.js 16 Hot Reload in Containers - Problem & Solutions

## Overview

This document outlines the common hot reload issues encountered when running Next.js 16 (with Turbopack) inside Docker/Podman containers and provides comprehensive solutions to resolve them.

## Table of Contents

- [The Problem](#the-problem)
- [Root Causes](#root-causes)
- [Solutions](#solutions)
- [Configuration Examples](#configuration-examples)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## The Problem

### Symptoms

When running Next.js 16 in a containerized environment (Docker/Podman), developers often experience:

1. **No Hot Reload**: File changes are not reflected in the browser without manual refresh
2. **Delayed Updates**: Changes take several seconds or minutes to appear
3. **Partial Updates**: Only some files trigger hot reload while others don't
4. **Build Errors**: Sometimes the dev server shows stale code or fails to rebuild

### Example Scenario

```bash
# Developer workflow:
1. Edit a component in VSCode: components/MyComponent.tsx
2. Save the file (Cmd/Ctrl + S)
3. Switch to browser
4. Expected: Changes appear automatically
5. Actual: No changes visible, old code still showing
```

---

## Root Causes

### 1. **File System Event Propagation**

**Problem**: Container file systems (especially on macOS and Windows) don't properly propagate file system events from the host to the container.

**Technical Details**:
- Docker Desktop on macOS uses `osxfs` which doesn't support inotify events
- Docker Desktop on Windows uses WSL2 which has similar limitations
- Next.js relies on `fs.watch()` or `chokidar` to detect file changes
- These watchers depend on native file system events (inotify on Linux, FSEvents on macOS)

### 2. **Volume Mount Performance**

**Problem**: Bind mounts have performance overhead that can affect file watching.

**Technical Details**:
- Volume mounts create a layer between host and container file systems
- File metadata changes might not sync immediately
- Large `node_modules` directories exacerbate the issue

### 3. **Next.js 16 / Turbopack Specifics**

**Problem**: Next.js 16 with Turbopack has different watching mechanisms than previous versions.

**Technical Details**:
- Turbopack uses Rust-based file watching
- More strict about file system event requirements
- May not fall back to polling automatically

### 4. **Network Configuration**

**Problem**: WebSocket connections for HMR (Hot Module Replacement) might not work correctly.

**Technical Details**:
- HMR uses WebSocket at `ws://localhost:3000/_next/webpack-hmr`
- Container networking can interfere with WebSocket connections
- Port mapping issues can prevent proper communication

---

## Solutions

### Solution 1: Enable Polling (Recommended for Development)

Polling forces Next.js to regularly check for file changes instead of relying on file system events.

#### Implementation Steps

**Step 1: Update package.json**

Add the `--experimental-turbo-force-polling` flag to your dev script:

```json
{
  "scripts": {
    "dev": "next dev --turbo --experimental-turbo-force-polling"
  }
}
```

**Step 2: Configure Polling Interval (Optional)**

You can adjust the polling interval using environment variables:

```bash
# In docker-compose.yml or Dockerfile
WATCHPACK_POLLING=true
CHOKIDAR_USEPOLLING=true
CHOKIDAR_INTERVAL=1000  # Poll every 1 second (1000ms)
```

**Step 3: Restart Container**

```bash
podman-compose restart frontend
# or
docker-compose restart frontend
```

#### Pros & Cons

✅ **Pros**:
- Works reliably across all platforms
- No special Docker/Podman configuration needed
- Consistent behavior

❌ **Cons**:
- Higher CPU usage (constantly polling files)
- Slight delay before changes are detected
- More battery consumption on laptops

---

### Solution 2: Optimize Volume Mounts (macOS/Windows)

Use delegated or cached volume mount options to improve performance.

#### Implementation for Docker Compose

```yaml
# docker-compose.yml
services:
  frontend:
    build:
      context: ./frontend
    volumes:
      # Use delegated mount for better performance on macOS/Windows
      - ./frontend:/app:delegated
      
      # Exclude node_modules from sync (keep it in container)
      - /app/node_modules
      - /app/.next
      
    environment:
      - WATCHPACK_POLLING=true
      - CHOKIDAR_USEPOLLING=true
```

#### Mount Options Explained

- **`:delegated`**: Container's view of files can be temporarily inconsistent with host. Best for write-heavy operations from host.
- **`:cached`**: Host's view can be temporarily inconsistent. Best for read-heavy operations from host.
- **`:consistent`**: Full consistency (default, slowest)

#### For Podman

```yaml
# docker-compose.yml (works with podman-compose)
services:
  frontend:
    volumes:
      - ./frontend:/app:z  # SELinux label, required on some Linux distros
      - /app/node_modules
```

---

### Solution 3: Use Named Volumes for Dependencies

Keep `node_modules` and build artifacts in named volumes for better performance.

#### Implementation

```yaml
# docker-compose.yml
services:
  frontend:
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
      - frontend_next:/app/.next
    environment:
      - WATCHPACK_POLLING=true

volumes:
  frontend_node_modules:
  frontend_next:
```

#### Benefits

- `node_modules` stays in container (faster)
- Only source code is synced from host
- Reduces number of files being watched
- Significantly improves performance

---

### Solution 4: Configure Webpack/Turbopack Watch Options

Fine-tune the file watching configuration.

#### Create/Update next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Webpack configuration (fallback when Turbopack not used)
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Increase polling interval to reduce CPU usage
      config.watchOptions = {
        poll: 1000, // Check for changes every second
        aggregateTimeout: 300, // Delay rebuild after the first change
        ignored: /node_modules/,
      };
    }
    return config;
  },

  // Turbopack experimental options
  experimental: {
    turbo: {
      // Force polling for containers
      forcePolling: true,
    },
  },

  // Output configuration
  output: 'standalone', // Better for production containers
};

module.exports = nextConfig;
```

---

### Solution 5: Network & WebSocket Configuration

Ensure HMR WebSocket connections work properly.

#### Update next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow connections from any host (needed for Docker networking)
  webpack: (config, { dev }) => {
    if (dev) {
      config.devServer = {
        ...config.devServer,
        // Allow WebSocket connections from Docker network
        allowedHosts: 'all',
        client: {
          webSocketURL: 'auto://0.0.0.0:0/ws',
        },
      };
    }
    return config;
  },
};

module.exports = nextConfig;
```

#### Docker Compose Configuration

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      # Ensure Next.js listens on all interfaces
      - HOSTNAME=0.0.0.0
      - PORT=3000
      # Enable HMR
      - FAST_REFRESH=true
```

---

## Configuration Examples

### Complete Docker Compose Setup

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    
    container_name: voice-app_frontend
    
    ports:
      - "3000:3000"
    
    volumes:
      # Source code with delegated mount for performance
      - ./frontend:/app:delegated
      
      # Keep these in container for better performance
      - /app/node_modules
      - /app/.next
      - /app/.turbo
    
    environment:
      # Next.js configuration
      - NODE_ENV=development
      - HOSTNAME=0.0.0.0
      - PORT=3000
      
      # Enable hot reload via polling
      - WATCHPACK_POLLING=true
      - CHOKIDAR_USEPOLLING=true
      - CHOKIDAR_INTERVAL=1000
      
      # Fast Refresh (HMR)
      - FAST_REFRESH=true
      
      # API connection
      - NEXT_PUBLIC_API_URL=http://backend:8000
    
    command: npm run dev
    
    networks:
      - app-network
    
    depends_on:
      - backend

networks:
  app-network:
    driver: bridge
```

### Complete Dockerfile for Development

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Development command with hot reload
CMD ["npm", "run", "dev"]
```

### Updated package.json

```json
{
  "name": "voice-app-frontend",
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev --turbo --experimental-turbo-force-polling --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^16.1.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

---

## Troubleshooting

### Issue 1: Hot Reload Still Not Working

**Check 1: Verify Polling is Enabled**

```bash
# Check container logs
podman logs voice-app_frontend_1 | grep -i "polling\|watch"

# You should see something like:
# ○ Compiling with Turbopack (polling enabled)
```

**Check 2: Verify Environment Variables**

```bash
# Enter container
podman exec -it voice-app_frontend_1 sh

# Check env vars
env | grep -i "watch\|poll"
```

**Check 3: Test File System**

```bash
# Create a test file from host
echo "test" > frontend/test.txt

# Check if it appears in container
podman exec voice-app_frontend_1 ls -la /app/test.txt
```

---

### Issue 2: High CPU Usage

**Problem**: Polling uses more CPU than event-based watching.

**Solution**: Increase polling interval

```json
{
  "scripts": {
    "dev": "CHOKIDAR_INTERVAL=2000 next dev --turbo --experimental-turbo-force-polling"
  }
}
```

Or in docker-compose.yml:

```yaml
environment:
  - CHOKIDAR_INTERVAL=2000  # Poll every 2 seconds instead of 1
```

---

### Issue 3: WebSocket Connection Failed

**Check Browser Console**:
```
WebSocket connection to 'ws://localhost:3000/_next/webpack-hmr' failed
```

**Solution 1: Update next.config.js**

```javascript
module.exports = {
  webpack: (config, { dev }) => {
    if (dev) {
      config.devServer = {
        ...config.devServer,
        allowedHosts: 'all',
      };
    }
    return config;
  },
};
```

**Solution 2: Check Port Mapping**

```bash
# Ensure port 3000 is properly mapped
podman ps | grep frontend

# Should show: 0.0.0.0:3000->3000/tcp
```

---

### Issue 4: Changes Detected But Not Reflected

**Problem**: Next.js detects changes but browser doesn't update.

**Solution**: Clear Next.js cache

```bash
# Stop containers
podman-compose down

# Clear Next.js cache
rm -rf frontend/.next

# Rebuild and start
podman-compose up --build
```

---

### Issue 5: Only Some Files Trigger Hot Reload

**Problem**: `.tsx` files reload but `.css` or `.ts` files don't.

**Check 1: Verify File Watching Patterns**

Create `.watchmanconfig` in project root:

```json
{
  "ignore_dirs": [
    "node_modules",
    ".next",
    ".git"
  ]
}
```

**Check 2: Restart Dev Server**

Sometimes the watcher needs to be restarted:

```bash
podman-compose restart frontend
```

---

## Best Practices

### 1. Development vs Production

**Development (Hot Reload Enabled)**:
```yaml
# docker-compose.yml
services:
  frontend:
    volumes:
      - ./frontend:/app:delegated
      - /app/node_modules
    environment:
      - WATCHPACK_POLLING=true
    command: npm run dev
```

**Production (No Hot Reload)**:
```yaml
# docker-compose.prod.yml
services:
  frontend:
    # No volume mounts
    # No polling environment variables
    command: npm run start
```

### 2. Optimize for Your Platform

**macOS/Windows**:
- Always use polling
- Use `:delegated` mounts
- Exclude `node_modules`

**Linux**:
- Try without polling first (inotify works natively)
- If issues, enable polling
- SELinux labels (`:z` or `:Z`) if needed

### 3. Monitor Performance

```bash
# Check CPU usage
podman stats voice-app_frontend_1

# If CPU > 20%, increase polling interval
CHOKIDAR_INTERVAL=3000
```

### 4. Use .dockerignore

Prevent unnecessary files from being watched:

```
# frontend/.dockerignore
node_modules
.next
.git
*.log
.DS_Store
coverage
dist
build
```

### 5. Git Configuration

If using Git in the container, configure it properly:

```dockerfile
# In Dockerfile
RUN git config --global --add safe.directory /app
```

---

## Platform-Specific Notes

### macOS (Docker Desktop / Podman Desktop)

**Known Issues**:
- `osxfs` doesn't support native file system events
- Volume mounts are slower than Linux

**Recommended Setup**:
```yaml
volumes:
  - ./frontend:/app:delegated
  - /app/node_modules
environment:
  - WATCHPACK_POLLING=true
  - CHOKIDAR_INTERVAL=1000
```

### Windows (Docker Desktop / WSL2)

**Known Issues**:
- Similar to macOS limitations
- WSL2 file system bridge adds latency

**Recommended Setup**:
```yaml
volumes:
  - ./frontend:/app:cached
  - /app/node_modules
environment:
  - WATCHPACK_POLLING=true
  - CHOKIDAR_INTERVAL=1500
```

### Linux (Native Docker / Podman)

**Advantages**:
- Native `inotify` support
- Better performance

**Recommended Setup** (try without polling first):
```yaml
volumes:
  - ./frontend:/app:z  # SELinux systems
  - /app/node_modules
# Try without WATCHPACK_POLLING first
```

---

## Summary

### Quick Fix Checklist

1. ✅ Add `--experimental-turbo-force-polling` to dev script
2. ✅ Set `WATCHPACK_POLLING=true` in docker-compose.yml
3. ✅ Use `:delegated` mount option (macOS/Windows)
4. ✅ Exclude `node_modules` and `.next` from volume mounts
5. ✅ Verify port 3000 is properly mapped
6. ✅ Clear `.next` cache if issues persist
7. ✅ Check browser console for WebSocket errors

### When Hot Reload Works

✅ You should see in terminal:
```
▲ Next.js 16.1.1 (Turbopack)
- Local:        http://localhost:3000
- Network:      http://0.0.0.0:3000

✓ Starting...
✓ Ready in 2.5s
○ Compiling / ...
✓ Compiled / in 1.2s (polling enabled)
```

✅ Browser console shows:
```
[HMR] connected
[Fast Refresh] rebuilding
[Fast Refresh] done
```

---

## Additional Resources

- [Next.js Turbopack Documentation](https://nextjs.org/docs/architecture/turbopack)
- [Docker Volume Mount Performance](https://docs.docker.com/storage/bind-mounts/)
- [Chokidar Configuration](https://github.com/paulmillr/chokidar)
- [Next.js GitHub Issues - Hot Reload](https://github.com/vercel/next.js/issues?q=hot+reload+docker)

---

## Changelog

- **2026-01-07**: Initial documentation for Next.js 16 + Turbopack in containers
- Added comprehensive troubleshooting section
- Added platform-specific recommendations

---

## Contributing

If you discover additional issues or solutions, please update this document or create a pull request with your findings.
