# Testing with Docker

This guide explains how to use the test Dockerfiles for running unit, integration, and end-to-end tests in isolated Docker containers.

## Test Dockerfiles

### Backend Test Dockerfile
- **File**: `backend/Dockerfile.test`
- **Purpose**: Run backend Python tests (unit, integration, e2e)
- **Includes**: pytest, coverage tools, all test dependencies

### Frontend Test Dockerfile
- **File**: `frontend/Dockerfile.test`
- **Purpose**: Run frontend tests (Jest unit tests, Playwright e2e)
- **Includes**: Node.js, Playwright, Chromium browser

## Usage

### Backend Tests

#### Build the test image:
```bash
cd backend
podman build -f Dockerfile.test -t voice-app-backend-test .
```

#### Run all tests with coverage:
```bash
podman run --rm voice-app-backend-test
```

#### Run specific test suites:
```bash
# Unit tests only
podman run --rm voice-app-backend-test pytest tests/unit -v

# Integration tests
podman run --rm voice-app-backend-test pytest tests/integration -v

# E2E tests
podman run --rm voice-app-backend-test pytest tests/e2e -v

# Specific test file
podman run --rm voice-app-backend-test pytest tests/unit/test_job_monitor.py -v

# With coverage report
podman run --rm voice-app-backend-test pytest --cov=app --cov-report=html
```

#### Run tests with environment variables:
```bash
podman run --rm \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e TESTING=1 \
  voice-app-backend-test pytest tests/unit -v
```

#### Run tests with volume mounts (for coverage reports):
```bash
podman run --rm \
  -v $(pwd)/htmlcov:/app/htmlcov \
  voice-app-backend-test
```

### Frontend Tests

#### Build the test image:
```bash
cd frontend
podman build -f Dockerfile.test -t voice-app-frontend-test .
```

#### Run all tests:
```bash
podman run --rm voice-app-frontend-test
```

#### Run specific test suites:
```bash
# Jest unit tests only
podman run --rm voice-app-frontend-test npm run test

# Playwright e2e tests
podman run --rm voice-app-frontend-test npx playwright test

# With headed browser (requires X11 forwarding)
podman run --rm \
  -e DISPLAY=$DISPLAY \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  voice-app-frontend-test npx playwright test --headed
```

#### Run tests with coverage:
```bash
podman run --rm \
  -v $(pwd)/coverage:/app/coverage \
  voice-app-frontend-test npm run test:coverage
```

## Docker Compose Integration

You can also add test services to `docker-compose.yml`:

```yaml
# Backend tests
backend-test:
  build:
    context: ./backend
    dockerfile: Dockerfile.test
  environment:
    - DATABASE_URL=postgresql://voiceapp:voiceapp@postgres:5432/voiceapp_test
    - TESTING=1
  depends_on:
    - postgres
  command: pytest -v

# Frontend tests
frontend-test:
  build:
    context: ./frontend
    dockerfile: Dockerfile.test
  environment:
    - NEXT_PUBLIC_API_URL=http://backend:8000
  command: npm test
```

Then run:
```bash
# Backend tests
podman-compose run --rm backend-test

# Frontend tests
podman-compose run --rm frontend-test

# Specific command
podman-compose run --rm backend-test pytest tests/unit -v
```

## CI/CD Integration

### GitHub Actions Example:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build test image
        run: |
          cd backend
          docker build -f Dockerfile.test -t backend-test .
      
      - name: Run tests
        run: docker run --rm backend-test pytest -v --cov=app

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build test image
        run: |
          cd frontend
          docker build -f Dockerfile.test -t frontend-test .
      
      - name: Run tests
        run: docker run --rm frontend-test npm test
```

## Tips and Best Practices

### 1. **Faster builds with layer caching**
```bash
# Use BuildKit for better caching
export DOCKER_BUILDKIT=1
docker build -f Dockerfile.test -t test-image .
```

### 2. **Parallel test execution**
```bash
# Backend (pytest-xdist)
podman run --rm voice-app-backend-test pytest -n auto

# Frontend (Jest)
podman run --rm voice-app-frontend-test npm test -- --maxWorkers=4
```

### 3. **Interactive debugging**
```bash
# Drop into shell
podman run --rm -it voice-app-backend-test bash

# Then run tests manually
pytest tests/unit/test_file.py -vv --pdb
```

### 4. **Watch mode for development**
```bash
# Mount source code for live reloading
podman run --rm -it \
  -v $(pwd)/backend:/app \
  voice-app-backend-test \
  pytest --watch
```

### 5. **Save test artifacts**
```bash
# Extract coverage reports
podman run --rm \
  -v $(pwd)/test-results:/app/htmlcov \
  voice-app-backend-test
```

## Troubleshooting

### Backend tests failing to connect to database
```bash
# Make sure postgres is running
podman ps | grep postgres

# Run tests with docker-compose (provides postgres)
podman-compose run --rm backend-test
```

### Frontend Playwright tests failing
```bash
# Ensure Chromium is installed
podman run --rm voice-app-frontend-test npx playwright install chromium

# Run with debug logs
podman run --rm -e DEBUG=pw:* voice-app-frontend-test npx playwright test
```

### Permission errors
```bash
# Run as current user
podman run --rm --user $(id -u):$(id -g) voice-app-backend-test
```

## Clean Up

```bash
# Remove test images
podman rmi voice-app-backend-test voice-app-frontend-test

# Remove all test containers
podman container prune

# Remove dangling images
podman image prune
```
