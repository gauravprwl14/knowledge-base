# Docker Build Optimization + Claude Code Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Docker build times by 60-80% via BuildKit cache mounts and eliminate Claude Code setup gaps (wrong MCPs for server, missing hooks, missing skills, missing scripts) to enable true multi-task parallel development.

**Architecture:** Two independent tracks — (A) Dockerfile/compose changes that add BuildKit cache mounts and `.dockerignore` files, and (B) Claude Code config changes that fix MCPs, add hooks, create a frontend skill, and add helper scripts. Both tracks can be executed in parallel but committed separately.

**Tech Stack:** Docker BuildKit, Python pip cache mounts, npm cache mounts, Claude Code MCP/hooks system, Bash scripts.

---

## Context (read before starting)

- 8 services in `docker-compose.prod.yml` — each builds its own image
- 6 Python services under `services/` — all use `pip install --no-cache-dir` which defeats caching
- `kms-api/Dockerfile` runs `npm ci` 3 times across stages (no reuse)
- `frontend/Dockerfile` already has BuildKit cache mount — use as reference
- `.claude/.clauderc` has `playwright` MCP enabled (broken on server) and `context7` disabled
- No hooks configured anywhere
- No `.dockerignore` in any Python service

---

## File Map

### Track A — Docker

| Action | File |
|--------|------|
| Modify | `kms-api/Dockerfile` |
| Modify | `services/scan-worker/Dockerfile` |
| Modify | `services/embed-worker/Dockerfile` |
| Modify | `services/rag-service/Dockerfile` |
| Modify | `services/dedup-worker/Dockerfile` |
| Modify | `services/graph-worker/Dockerfile` |
| Modify | `services/voice-app/Dockerfile` |
| Create | `services/scan-worker/.dockerignore` |
| Create | `services/embed-worker/.dockerignore` |
| Create | `services/rag-service/.dockerignore` |
| Create | `services/dedup-worker/.dockerignore` |
| Create | `services/graph-worker/.dockerignore` |
| Create | `services/voice-app/.dockerignore` |
| Create | `scripts/build-changed.sh` |
| Create | `scripts/test-service.sh` |
| Create | `scripts/deploy-service.sh` |

### Track B — Claude Code Setup

| Action | File |
|--------|------|
| Modify | `.claude/.clauderc` |
| Modify | `CLAUDE.md` (routing table — add frontend row) |
| Create | `.claude/skills/kb-frontend-lead/SKILL.md` |
| Create | `docs/development/FOR-frontend-patterns.md` |

---

## Track A — Docker Build Optimization

---

### Task 1: Enable BuildKit globally

**Files:**
- Modify: `.env.kms.example` (host-side note only — `DOCKER_BUILDKIT` is a shell var, not a container env var)

- [ ] **Step 1: Add a comment to `.env.kms.example` documenting the required host shell vars**

Open `.env.kms.example` and add at the top:

```bash
# ─── HOST SHELL VARS (export in ~/.bashrc, not passed to containers) ──────────
# DOCKER_BUILDKIT=1              # Enable BuildKit for faster cached builds
# COMPOSE_DOCKER_CLI_BUILD=1     # Use BuildKit for docker compose build
```

Note: Do NOT add these to `.env.prod` (they are Docker daemon client vars, not container envs).

- [ ] **Step 2: Verify BuildKit is active on the server**

```bash
export DOCKER_BUILDKIT=1
docker build --help | grep -i buildkit
# Should show BuildKit as default builder
docker buildx version
```

Expected output: BuildKit version info. If `docker buildx` is missing, run:
```bash
docker buildx install
```

- [ ] **Step 3: Export for current shell session**

```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

- [ ] **Step 4: Add to shell profile permanently**

```bash
echo 'export DOCKER_BUILDKIT=1' >> ~/.bashrc
echo 'export COMPOSE_DOCKER_CLI_BUILD=1' >> ~/.bashrc
source ~/.bashrc
```

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add .env.kms.example
git commit -m "build: document DOCKER_BUILDKIT host shell vars in .env.kms.example"
```

---

### Task 2: Fix Python service Dockerfiles — add pip cache mounts

**Files:**
- Modify: `services/scan-worker/Dockerfile`
- Modify: `services/embed-worker/Dockerfile`
- Modify: `services/rag-service/Dockerfile`
- Modify: `services/dedup-worker/Dockerfile`
- Modify: `services/graph-worker/Dockerfile`
- Modify: `services/voice-app/Dockerfile`

The pattern is identical for all 6. Replace `pip install --no-cache-dir` with a BuildKit cache mount. This persists the pip download cache at `/root/.cache/pip` across builds — packages already downloaded are never re-fetched.

- [ ] **Step 1: Fix `services/scan-worker/Dockerfile`**

Open the file. Find:
```dockerfile
FROM base AS dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```

Replace with:
```dockerfile
FROM base AS dependencies
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt
```

- [ ] **Step 2: Fix `services/embed-worker/Dockerfile`**

Same replacement:
```dockerfile
FROM base AS dependencies
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt
```

- [ ] **Step 3: Fix `services/rag-service/Dockerfile`**

Same replacement.

- [ ] **Step 4: Fix `services/dedup-worker/Dockerfile`**

Same replacement. Read the file first to confirm it follows the same pattern before editing.

- [ ] **Step 5: Fix `services/graph-worker/Dockerfile`**

Same replacement.

- [ ] **Step 6: Fix `services/voice-app/Dockerfile`**

Same replacement. Note: voice-app may have additional apt packages — only change the `pip install` line, leave apt untouched.

- [ ] **Step 7: Verify syntax — test build of one service**

```bash
DOCKER_BUILDKIT=1 docker build \
  --target production \
  -t kms/scan-worker:test \
  services/scan-worker/
```

Expected: Build completes. First run downloads packages. Second run should show `CACHED` for the pip step.

Test pip cache hit (BuildKit cache mount is NOT the same as Docker layer cache):
```bash
# Run the build a second time WITHOUT changing anything
DOCKER_BUILDKIT=1 docker build --target production -t kms/scan-worker:test services/scan-worker/
```

Expected: The `RUN pip install` layer re-executes (BuildKit always re-runs changed-upstream layers), but pip resolves from the local cache mount at `/root/.cache/pip` — no packages are downloaded from the network. You'll see "Using cached ..." lines instead of download progress bars. Build time drops from ~60s to ~3s.

- [ ] **Step 8: Commit**

```bash
git add services/*/Dockerfile
git commit -m "build(python): add BuildKit pip cache mounts — removes --no-cache-dir from all 6 workers"
```

---

### Task 3: Fix `kms-api/Dockerfile` — add BuildKit npm cache mounts

**Files:**
- Modify: `kms-api/Dockerfile`

**Problem:** The `builder` and `test` stages both run `npm ci` without BuildKit cache mounts, so npm re-downloads packages from the network on every build.

**Important:** The `builder` stage needs ALL deps (including devDeps: `@nestjs/cli`, `typescript`, `ts-jest`) to compile TypeScript. The `dependencies` stage only installs `--only=production`. Do NOT copy `node_modules` from `dependencies` into `builder` — it will fail because `nest build` won't be available.

The correct fix is: add BuildKit npm cache mounts to each `npm ci` call independently. The cache mount persists the npm package cache at `/root/.npm` across builds — packages are resolved from local cache instead of re-downloaded.

- [ ] **Step 1: Read the current file**

```bash
cat kms-api/Dockerfile
```

Identify these three `npm ci` / `npm install` lines:
1. `dependencies` stage: `RUN npm ci --only=production --legacy-peer-deps`
2. `builder` stage: `RUN npm ci --legacy-peer-deps`
3. `test` stage: `RUN npm ci --legacy-peer-deps`

- [ ] **Step 2: Add BuildKit cache mount to the `dependencies` stage**

Find:
```dockerfile
# Install production dependencies
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force
```

Replace with:
```dockerfile
# Install production dependencies (BuildKit cache mount avoids re-downloading packages)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production --legacy-peer-deps
```

(Remove the `&& npm cache clean --force` — unnecessary when using BuildKit cache mount.)

- [ ] **Step 3: Add BuildKit cache mount to the `builder` stage**

Find:
```dockerfile
FROM base AS builder

# Copy package files and Prisma schema before npm ci
# (postinstall runs "prisma generate", so schema must exist before npm ci)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --legacy-peer-deps
```

Replace with:
```dockerfile
FROM base AS builder

# Copy package files and Prisma schema before npm ci
# (postinstall runs "prisma generate", so schema must exist before npm ci)
COPY package*.json ./
COPY prisma ./prisma/
# Install all deps including devDeps (required for nest build / TypeScript compilation)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps
```

- [ ] **Step 4: Add BuildKit cache mount to the `test` stage**

Find:
```dockerfile
FROM base AS test
...
COPY package*.json ./
RUN npm ci --legacy-peer-deps
```

Replace the `npm ci` line with:
```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps
```

- [ ] **Step 5: Test the build — first run**

```bash
DOCKER_BUILDKIT=1 docker build \
  --target production \
  -t kms/kms-api:test \
  kms-api/
```

Expected: Build completes successfully. `nest build` runs without errors.

- [ ] **Step 6: Test the build — second run (verify cache)**

Without changing any files:
```bash
DOCKER_BUILDKIT=1 docker build \
  --target production \
  -t kms/kms-api:test \
  kms-api/
```

Expected: `npm ci` steps complete in seconds — packages resolved from `/root/.npm` cache, not downloaded from npm registry.

- [ ] **Step 7: Commit**

```bash
git add kms-api/Dockerfile
git commit -m "build(kms-api): add BuildKit npm cache mounts to all three npm ci stages"
```

---

### Task 4: Add `.dockerignore` to all Python services

**Files:** 6 new `.dockerignore` files

Without `.dockerignore`, Docker sends the entire service directory as build context including `__pycache__`, test artifacts, and `.env` files.

- [ ] **Step 1: Create the standard Python `.dockerignore` content**

This content is the same for all 6 services. Create each file:

`services/scan-worker/.dockerignore`:
```
__pycache__/
*.pyc
*.pyo
*.pyd
.pytest_cache/
.coverage
htmlcov/
.env
.env.*
!.env.example
tests/
test_*.py
*.log
.git/
.gitignore
*.md
!README.md
Dockerfile*
docker-compose*.yml
.mypy_cache/
.ruff_cache/
dist/
build/
*.egg-info/
```

- [ ] **Step 2: Create identical files for remaining 5 services**

```bash
for svc in embed-worker rag-service dedup-worker graph-worker voice-app; do
  cp services/scan-worker/.dockerignore services/$svc/.dockerignore
done
```

- [ ] **Step 3: Verify build context reduction**

```bash
# Check build context size before and after
DOCKER_BUILDKIT=1 docker build \
  --target production \
  --no-cache \
  --progress=plain \
  -t kms/scan-worker:test \
  services/scan-worker/ 2>&1 | grep "transferring context"
```

Expected: Context size significantly smaller (no test files, __pycache__, etc.).

- [ ] **Step 4: Commit**

```bash
git add services/*/.dockerignore
git commit -m "build(python): add .dockerignore to all 6 Python services — exclude test artifacts and __pycache__"
```

---

### Task 5: Create build/deploy helper scripts

**Files:**
- Create: `scripts/build-changed.sh`
- Create: `scripts/test-service.sh`
- Create: `scripts/deploy-service.sh`

- [ ] **Step 1: Create `scripts/build-changed.sh`**

```bash
#!/usr/bin/env bash
# Build only services whose source files changed since the last commit.
# Usage: ./scripts/build-changed.sh [env-file]
#   Default env-file: .env.prod
#   Example: ./scripts/build-changed.sh .env.staging
set -euo pipefail

ENV_FILE="${1:-.env.prod}"
COMPOSE_FILE="docker-compose.prod.yml"

# Detect changed service directories
CHANGED_DIRS=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | \
  grep -oP '^(kms-api|search-api|frontend|services/[^/]+)' | \
  sort -u)

if [ -z "$CHANGED_DIRS" ]; then
  echo "No service directories changed since last commit."
  exit 0
fi

# Map directory names to compose service names
declare -A DIR_TO_SERVICE=(
  ["kms-api"]="kms-api"
  ["frontend"]="web-ui"
  ["search-api"]="search-api"
  ["services/rag-service"]="rag-service"
  ["services/scan-worker"]="scan-worker"
  ["services/embed-worker"]="embed-worker"
  ["services/dedup-worker"]="dedup-worker"
  ["services/graph-worker"]="graph-worker"
  ["services/voice-app"]="voice-app"
)

SERVICES_TO_BUILD=()
for dir in $CHANGED_DIRS; do
  svc="${DIR_TO_SERVICE[$dir]:-}"
  if [ -n "$svc" ]; then
    SERVICES_TO_BUILD+=("$svc")
  fi
done

if [ ${#SERVICES_TO_BUILD[@]} -eq 0 ]; then
  echo "No buildable services changed."
  exit 0
fi

echo "Building (parallel): ${SERVICES_TO_BUILD[*]}"
DOCKER_BUILDKIT=1 docker compose \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  build --parallel "${SERVICES_TO_BUILD[@]}"
```

- [ ] **Step 2: Create `scripts/test-service.sh`**

```bash
#!/usr/bin/env bash
# Run tests for a named service.
# Usage: ./scripts/test-service.sh <service-name>
# Examples:
#   ./scripts/test-service.sh kms-api
#   ./scripts/test-service.sh frontend
#   ./scripts/test-service.sh scan-worker
set -euo pipefail

SERVICE="${1:-}"

if [ -z "$SERVICE" ]; then
  echo "Usage: $0 <service-name>"
  echo "Services: kms-api, frontend, search-api, scan-worker, embed-worker, rag-service, dedup-worker, graph-worker, voice-app"
  exit 1
fi

case "$SERVICE" in
  kms-api)
    echo "Running kms-api tests..."
    cd kms-api && npm run test
    ;;
  search-api)
    echo "Running search-api tests..."
    cd search-api && npm run test
    ;;
  frontend)
    echo "Running frontend tests..."
    cd frontend && npx jest
    ;;
  scan-worker|embed-worker|rag-service|dedup-worker|graph-worker|voice-app)
    echo "Running $SERVICE tests..."
    cd "services/$SERVICE" && python -m pytest -v --tb=short
    ;;
  all)
    echo "Running all service tests..."
    (cd kms-api && npm run test)
    (cd search-api && npm run test)
    (cd frontend && npx jest)
    for svc in scan-worker embed-worker rag-service dedup-worker graph-worker voice-app; do
      echo "--- $svc ---"
      (cd "services/$svc" && python -m pytest -v --tb=short)
    done
    ;;
  *)
    echo "Unknown service: $SERVICE"
    exit 1
    ;;
esac
```

- [ ] **Step 3: Create `scripts/deploy-service.sh`**

```bash
#!/usr/bin/env bash
# Deploy a single service to production without restarting other containers.
# Usage: ./scripts/deploy-service.sh <compose-service-name>
# Example: ./scripts/deploy-service.sh kms-api
#
# This wraps the mandatory pattern from CLAUDE.local.md:
#   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps <service>
set -euo pipefail

SERVICE="${1:-}"

if [ -z "$SERVICE" ]; then
  echo "Usage: $0 <service-name>"
  echo "Services: kms-api, web-ui, search-api, rag-service, scan-worker, embed-worker, dedup-worker, graph-worker, voice-app"
  exit 1
fi

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Cannot deploy without secrets."
  exit 1
fi

echo "Building $SERVICE..."
DOCKER_BUILDKIT=1 docker compose \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  build "$SERVICE"

echo "Deploying $SERVICE (no-deps)..."
DOCKER_BUILDKIT=1 docker compose \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  up -d --no-deps "$SERVICE"

echo "Tailing logs for $SERVICE (Ctrl+C to exit)..."
docker compose -f "$COMPOSE_FILE" logs -f "$SERVICE"
```

- [ ] **Step 4: Make scripts executable**

```bash
chmod +x scripts/build-changed.sh scripts/test-service.sh scripts/deploy-service.sh
```

- [ ] **Step 5: Test `test-service.sh` against kms-api**

```bash
./scripts/test-service.sh kms-api
```

Expected: Jest runs, tests pass/fail with output.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-changed.sh scripts/test-service.sh scripts/deploy-service.sh
git commit -m "scripts: add build-changed, test-service, and deploy-service helpers"
```

---

## Track B — Claude Code Setup

---

### Task 6: Fix MCP configuration for Ubuntu server

**Files:**
- Modify: `.claude/.clauderc`

**Problem:**
- `playwright` MCP requires Chrome/Chromium — not available on Ubuntu server, will fail silently
- `context7` is disabled (`null`) — should be enabled, it's pure API calls with no browser
- `superpowers-chrome` is already null — leave it

- [ ] **Step 1: Read the current file**

Current content:
```json
{
    "mcpServers": {
        "playwright": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-playwright"]
        },
        "context7": null,
        "superpowers-chrome": null
    },
    "disableMcp": false
}
```

- [ ] **Step 2: Replace with server-appropriate config**

```json
{
    "mcpServers": {
        "context7": {
            "command": "npx",
            "args": ["-y", "@upstash/context7-mcp@latest"]
        },
        "github": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": {
                "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
            }
        }
    },
    "disableMcp": false
}
```

Notes:
- `playwright` removed — requires a browser binary, useless on headless server
- `context7` enabled — gives Claude live docs for NestJS, FastAPI, Prisma, Next.js
- `github` added — allows agents to create PRs, check CI, read issues
- `superpowers-chrome` removed (was null, no need to keep it)

- [ ] **Step 3: Set the GITHUB_TOKEN env var**

```bash
# Add placeholder to .env.kms.example (committed, no real value)
echo 'GITHUB_TOKEN=your-github-personal-access-token' >> .env.kms.example
```

Add your actual token to `.env.prod` (never committed):
```bash
echo 'GITHUB_TOKEN=ghp_your_actual_token' >> .env.prod
```

Then export it for the current Claude Code shell session (MCP env vars must be in the shell that starts Claude Code, not inside a container):
```bash
export GITHUB_TOKEN=ghp_your_actual_token
```

- [ ] **Step 4: Test context7 works**

Start a new Claude Code session and ask:
```
Use context7 to look up the NestJS Guards documentation
```

Expected: Claude retrieves live NestJS docs without a web search.

- [ ] **Step 5: Commit**

```bash
git add .claude/.clauderc .env.kms.example
git commit -m "config(claude): replace playwright MCP with context7 + github — playwright requires Chrome (not on server)"
```

---

### Task 7: Add Claude Code hooks for automation

**Files:**
- Create: `.claude/settings.json`
- Create: `scripts/auto-test-on-edit.sh`

Hooks fire automatically on agent actions. This adds a PostToolUse hook that logs file changes and optionally runs tests when a service file is edited.

- [ ] **Step 1: Create `scripts/auto-test-on-edit.sh`**

Claude Code passes tool input to hook commands via **stdin as a JSON object** (not as env vars or CLI args). The script must read from stdin and parse it with `jq`.

```bash
#!/usr/bin/env bash
# Called by Claude Code PostToolUse hook after every file edit.
# Claude Code passes tool input as JSON on stdin — we parse it with jq.
# Determines which service was edited and logs it (optionally runs tests).

# Read and parse tool input from stdin
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

# Log the edit
echo "[$(date +%H:%M:%S)] Edited: $FILE" >> /tmp/claude-edits.log

# Determine service from file path
if echo "$FILE" | grep -q "kms-api/"; then
  SERVICE="kms-api"
elif echo "$FILE" | grep -q "frontend/"; then
  SERVICE="frontend"
elif echo "$FILE" | grep -qP "services/[^/]+/"; then
  SERVICE=$(echo "$FILE" | grep -oP "services/\K[^/]+")
else
  exit 0
fi

echo "[$(date +%H:%M:%S)] Auto-test triggered for $SERVICE" >> /tmp/claude-edits.log
# Uncomment to enable automatic test runs on edit:
# /home/ubuntu/Sites/projects/gp/knowledge-base/scripts/test-service.sh "$SERVICE"
```

> Note: Requires `jq` — verify with `which jq`. Install if missing: `sudo apt-get install jq`.
> Auto-test is commented out by default. Uncomment for TDD sessions.

- [ ] **Step 2: Create `.claude/settings.json`**

**Critical format note:** Hook events must be at the TOP LEVEL of `settings.json` — no wrapping `"hooks"` key. The permissions `allow` list uses glob patterns for Bash commands.

```json
{
  "PostToolUse": [
    {
      "matcher": "Edit",
      "hooks": [
        {
          "type": "command",
          "command": "bash /home/ubuntu/Sites/projects/gp/knowledge-base/scripts/auto-test-on-edit.sh"
        }
      ]
    },
    {
      "matcher": "Write",
      "hooks": [
        {
          "type": "command",
          "command": "bash /home/ubuntu/Sites/projects/gp/knowledge-base/scripts/auto-test-on-edit.sh"
        }
      ]
    }
  ],
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "echo \"[$(date +%H:%M:%S)] Claude session ended\" >> /tmp/claude-sessions.log"
        }
      ]
    }
  ],
  "permissions": {
    "allow": [
      "Bash(scripts/test-service.sh:*)",
      "Bash(scripts/deploy-service.sh:*)",
      "Bash(scripts/build-changed.sh:*)"
    ]
  }
}
```

Note: `Edit` and `Write` are split into two separate hook entries to avoid regex ambiguity — `"matcher"` matches on exact tool name. No argument is passed to `auto-test-on-edit.sh` — the script reads Claude Code's JSON payload from stdin.

- [ ] **Step 3: Verify `jq` is installed**

```bash
which jq || sudo apt-get install -y jq
```

- [ ] **Step 4: Make auto-test script executable**

```bash
chmod +x scripts/auto-test-on-edit.sh
```

- [ ] **Step 5: Verify hook fires**

Start a Claude Code session, edit any file in `kms-api/`, then check:
```bash
cat /tmp/claude-edits.log
```

Expected: Log entries appear with timestamp and file path. If the log is empty after an edit, check that `.claude/settings.json` was saved with the correct top-level structure (no `"hooks"` wrapper).

- [ ] **Step 6: Commit**

```bash
git add .claude/settings.json scripts/auto-test-on-edit.sh
git commit -m "config(claude): add PostToolUse and Stop hooks for activity logging and auto-test"
```

---

### Task 8: Create `kb-frontend-lead` skill

**Files:**
- Create: `.claude/skills/kb-frontend-lead/SKILL.md`
- Create: `docs/development/FOR-frontend-patterns.md`
- Modify: `CLAUDE.md` (routing table)

This is the missing Layer 2 entry point for all React/Next.js/Tailwind work.

- [ ] **Step 1: Create the skill file**

Create `.claude/skills/kb-frontend-lead/SKILL.md`:

```markdown
---
name: kb-frontend-lead
description: >
  Implements Next.js 14 App Router pages, React components, Tailwind CSS styling,
  shadcn/ui components, and API client patterns for the KMS frontend.
  Use when adding or modifying frontend pages, components, hooks, or API client code.
  Trigger phrases: "add a page", "create a component", "fix a UI bug", "style this",
  "Next.js route", "React hook", "frontend error", "API client", "shadcn", "Tailwind".
---

# Frontend Lead — Next.js 14 + React + Tailwind

## Layer 2 Context

Read before implementing any frontend change:
- `docs/development/FOR-frontend-patterns.md` — component patterns, API client conventions
- `docs/development/FOR-error-handling.md` — how to surface API errors in UI

## Tech Stack

- **Framework**: Next.js 14 App Router (not Pages Router)
- **Language**: TypeScript strict mode
- **Styling**: Tailwind CSS + shadcn/ui components
- **State**: React hooks (no Redux/Zustand unless already present)
- **API**: `apiClient` from `frontend/lib/api.ts`
- **Forms**: React Hook Form + Zod validation (check if present first)

## Directory Structure

```
frontend/
  app/                    ← Next.js App Router pages
    (auth)/               ← Route groups
    layout.tsx            ← Root layout
  components/
    ui/                   ← shadcn primitives (do not modify)
    features/             ← Feature-specific components
    shared/               ← Reusable cross-feature components
  lib/
    api.ts                ← API client — all backend calls go here
    utils.ts              ← Utility functions
  hooks/                  ← Custom React hooks
```

## Mandatory Patterns

### Error Handling (CLAUDE.local.md rule — non-negotiable)

Every API call MUST follow this pattern:
```tsx
import { extractApiError } from '@/lib/utils';

try {
  const data = await apiClient.someCall();
  // handle success
} catch (err: unknown) {
  const msg = extractApiError(err); // reads .response.data.message
  toast.error(msg);                 // shows real server message
  console.error('[ComponentName]', err);
}
```

NEVER hardcode "Something went wrong". Always surface the real API error message.

### Component Structure

```tsx
// Feature component template
'use client'; // only if using hooks/events

import { type FC } from 'react';

interface Props {
  // explicit, minimal props
}

export const MyComponent: FC<Props> = ({ prop }) => {
  // hooks at top
  // handlers after hooks
  // return JSX
};
```

### API Client (lib/api.ts)

All HTTP calls go through `apiClient`. Never use `fetch` directly in components.
Check `frontend/lib/api.ts` for existing methods before adding new ones.

## When to Use shadcn/ui vs Custom

- **Always use shadcn**: Button, Input, Select, Dialog, Toast, Table, Badge, Card
- **Custom component**: Only when shadcn has no equivalent or needs heavy composition
- **Check first**: `ls frontend/components/ui/` before building custom primitives

## Testing

- Unit: `npx jest --testPathPattern=<component-name>`
- Component test file location: same directory as component, `*.test.tsx`
- Use `@testing-library/react` for component tests
- Mock API calls: `jest.mock('@/lib/api')`
```

- [ ] **Step 2: Create the feature guide**

Create `docs/development/FOR-frontend-patterns.md`:

```markdown
# FOR-frontend-patterns.md

Feature guide for Next.js 14 App Router + React + Tailwind + shadcn/ui patterns in the KMS frontend.

## App Router Conventions

- Pages live in `app/` as `page.tsx` files
- Layouts live as `layout.tsx` — wrap with providers here
- Loading states: `loading.tsx` in the same directory
- Error boundaries: `error.tsx` in the same directory
- API routes: `app/api/**` — use only for BFF patterns, not as a proxy

## API Client Pattern

All backend calls go through `frontend/lib/api.ts`. Before adding a new method:
1. Check if it already exists
2. Follow the existing method signature style
3. Return typed data, throw on error (let callers handle)

```typescript
// lib/api.ts — add new methods following this shape
export const filesApi = {
  list: (params: ListFilesParams): Promise<FilesListResponse> =>
    apiClient.get('/api/v1/files', { params }).then(r => r.data),

  upload: (formData: FormData): Promise<FileResponse> =>
    apiClient.post('/api/v1/files', formData).then(r => r.data),
};
```

## Tailwind Conventions

- Use design tokens from `tailwind.config.ts` — don't hardcode colors
- Responsive: mobile-first (`sm:`, `md:`, `lg:`)
- Dark mode: `dark:` variants where needed
- Avoid arbitrary values `[123px]` unless unavoidable

## State Management

- Local UI state: `useState`
- Shared server state: React Query / SWR if installed, otherwise prop drilling to nearest common parent
- Forms: React Hook Form + Zod (check `frontend/package.json` first)
- No global state stores unless already present

## Importing shadcn Components

```tsx
// Import from components/ui — never from node_modules directly
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
```
```

- [ ] **Step 3: Update CLAUDE.md routing table**

Open `CLAUDE.md`, find the routing table under `## Routing Table — What to Load`, and add a frontend row:

Find:
```markdown
| Add NestJS endpoint or module | `docs/development/CONTEXT.md` → `FOR-nestjs-patterns.md`, `FOR-error-handling.md` | `architecture/` |
```

Add after it:
```markdown
| Add frontend page, component, or hook | `docs/development/CONTEXT.md` → `FOR-frontend-patterns.md`, `FOR-error-handling.md` | `architecture/` |
```

Also add to the Skill Registry table:

Find:
```markdown
| `kb-backend-lead` | NestJS modules, services, controllers, Prisma, TypeScript | "add a NestJS endpoint", ...
```

Add after it:
```markdown
| `kb-frontend-lead` | Next.js 14 pages, React components, Tailwind, shadcn, API client | "add a page", "create a component", "fix a UI bug", "Next.js route", "API client" |
```

- [ ] **Step 4: Register the skill in the agent quick reference**

In `CLAUDE.md`, find `## Agent Quick Reference`. Add:
```markdown
| Frontend component or page | Use `kb-frontend-lead` skill |
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/kb-frontend-lead/SKILL.md \
        docs/development/FOR-frontend-patterns.md \
        CLAUDE.md
git commit -m "feat(claude): add kb-frontend-lead skill and FOR-frontend-patterns guide — Layer 2 frontend context"
```

---

### Task 9: Update CLAUDE.md with 3-layer context model documentation

**Files:**
- Modify: `CLAUDE.md`

This adds explicit documentation of the 3-layer context model so all agents understand it and apply it consistently.

- [ ] **Step 1: Add a new section to CLAUDE.md**

Open `CLAUDE.md` and add a new section after `## Routing Table — What to Load`:

```markdown
## 3-Layer Context Model

Claude agents MUST use context in layers to avoid context window bloat. Never load everything — load only what each layer dictates for the task.

### Layer 1 — Always Loaded (routing + rules)
These files are loaded every session automatically:
- `CLAUDE.md` — project rules, routing table, naming conventions
- `CLAUDE.local.md` — session-derived rules, mandatory workflow (RCA-first, OTel, testing, deployment)

**Rule**: Layer 1 is routing only. It tells you WHAT to load in Layer 2.

### Layer 2 — Loaded On Demand (domain knowledge)
Load the specific guide for your task — nothing else:
```
docs/development/CONTEXT.md → FOR-nestjs-patterns.md    (NestJS work)
docs/development/CONTEXT.md → FOR-python-patterns.md    (Python workers)
docs/development/CONTEXT.md → FOR-frontend-patterns.md  (Next.js/React work)
docs/development/CONTEXT.md → FOR-database.md           (DB/Prisma)
docs/development/CONTEXT.md → FOR-testing.md            (tests)
docs/development/CONTEXT.md → FOR-error-handling.md     (error patterns)
docs/development/CONTEXT.md → FOR-observability.md      (OTel/logging)
docs/architecture/CONTEXT.md → decisions/               (ADRs)
```

**Rule**: Read the relevant CONTEXT.md first. It tells you which FOR-*.md to load.

### Layer 3 — Task-Specific (active code)
Only read the files being changed right now:
- The service file you're modifying
- Its test file
- Its direct dependencies (imports)

**Rule**: Do NOT speculatively read unrelated files. Only load what you need to make the current change.

### Agent Checklist Before Starting Any Task
1. Which layer 2 guide applies? (Check routing table above)
2. Which layer 3 files need to be read? (Only changed files + direct deps)
3. Am I carrying stale context from a previous task? If so, stop and re-read the relevant files.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document 3-layer context model in CLAUDE.md — prevents context window bloat"
```

---

## Verification — Full System Check

After all tasks are complete:

- [ ] **Docker: warm build is fast**

```bash
export DOCKER_BUILDKIT=1
# Make a trivial code change, then rebuild
touch services/scan-worker/app/main.py
docker compose -f docker-compose.prod.yml --env-file .env.prod build scan-worker
# Expected: Only the COPY step runs. pip install step shows CACHED.
```

- [ ] **Scripts work**

```bash
./scripts/test-service.sh kms-api    # Should run Jest
./scripts/test-service.sh scan-worker  # Should run pytest
./scripts/build-changed.sh           # Should detect changed services
```

- [ ] **context7 MCP active**

Start Claude Code session. Ask: `Use context7 to get NestJS Providers documentation.`
Expected: Claude returns live NestJS docs.

- [ ] **Hook fires**

Edit any `kms-api/` file in Claude Code. Then:
```bash
cat /tmp/claude-edits.log
```
Expected: Log entry with timestamp and file path.

- [ ] **kb-frontend-lead skill loads**

In Claude Code, use the Skill tool with `kb-frontend-lead`.
Expected: Skill loads with Next.js patterns content.

---

## Quick Reference — What Changed

| Area | Before | After |
|------|--------|-------|
| Python pip installs | `--no-cache-dir` — re-downloads every build | BuildKit cache mount — packages cached |
| kms-api npm install | 3x `npm ci` per build | 1x install, 2x reuse |
| Docker BuildKit | Not enabled | `DOCKER_BUILDKIT=1` global |
| Python .dockerignore | None (6 services) | Added to all 6 |
| Playwright MCP | Enabled (broken on server) | Removed |
| context7 MCP | Disabled | Enabled |
| GitHub MCP | Missing | Added |
| Hooks | 0 configured | PostToolUse + Stop |
| Frontend skill | Missing | `kb-frontend-lead` added |
| Helper scripts | None | `build-changed`, `test-service`, `deploy-service` |
| 3-layer context | Undocumented | Documented in CLAUDE.md |
