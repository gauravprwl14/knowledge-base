# Docker Testing Guide

This guide explains how to run tests using the Docker test infrastructure with automated database setup and parallel execution.

## Quick Start

### Run All Tests (Parallel)

```bash
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

This runs all test suites in parallel with automatic cleanup.

### Run Specific Test Suite

```bash
# Backend unit tests only
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests

# Backend integration tests only
docker-compose -f docker-compose.test.yml run --rm backend_integration_tests

# Frontend unit tests only
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests

# Frontend E2E tests only
docker-compose -f docker-compose.test.yml up --abort-on-container-exit frontend_e2e_tests
```

## Test Infrastructure

### Architecture

```
docker-compose.test.yml
├── postgres_test (tmpfs - in-memory, 10x faster)
├── rabbitmq_test (for integration tests)
├── backend_unit_tests
├── backend_integration_tests
├── frontend_unit_tests
├── frontend_e2e_tests
└── backend_test_api (for E2E tests)
```

### Key Features

1. **In-Memory Test Database**: Uses `tmpfs` for 10x faster tests
2. **Isolated Environment**: Separate from development services
3. **Automatic Setup**: Database schema created automatically
4. **Health Checks**: Services wait for dependencies to be ready
5. **Parallel Execution**: Run multiple test suites simultaneously
6. **Coverage Reports**: Stored in named volumes for extraction

## Test Suite Organization

### Backend Tests

**Location**: `backend/tests/`

```
backend/tests/
├── conftest.py                    # Pytest fixtures
├── unit/                           # Fast, isolated tests
│   ├── test_api_upload.py
│   ├── test_api_jobs.py
│   ├── test_api_transcriptions.py
│   ├── test_job_deletion.py
│   ├── test_job_monitor.py
│   ├── test_whisper_caching.py
│   └── test_worker_error_handling.py
├── integration/                    # Tests requiring services
│   └── (integration tests)
└── e2e/                            # Full workflow tests
    └── test_upload_transcribe_workflow.py
```

**Test Markers**:
- `@pytest.mark.unit` - Fast unit tests
- `@pytest.mark.integration` - Integration tests (DB, RabbitMQ)
- `@pytest.mark.e2e` - End-to-end workflow tests
- `@pytest.mark.slow` - Long-running tests

### Frontend Tests

**Location**: `frontend/__tests__/`

```
frontend/__tests__/
├── unit/
│   ├── app/
│   │   └── page.test.tsx           # Page tests
│   └── components/
│       └── FileUpload.test.tsx      # Component tests
└── e2e/
    └── upload-workflow.spec.ts      # Playwright E2E tests
```

## Running Tests

### Backend Unit Tests

```bash
# Run all unit tests
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests

# Run specific test file
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
  pytest tests/unit/test_whisper_caching.py -v

# Run specific test function
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
  pytest tests/unit/test_whisper_caching.py::test_model_caching -v

# Run with verbose output
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
  pytest tests/unit -v -s

# Run tests matching pattern
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
  pytest tests/unit -k "whisper" -v
```

### Backend Integration Tests

```bash
# Run all integration tests
docker-compose -f docker-compose.test.yml run --rm backend_integration_tests

# Run with verbose output
docker-compose -f docker-compose.test.yml run --rm backend_integration_tests \
  pytest tests/integration -v
```

### Frontend Unit Tests

```bash
# Run all Jest tests
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests

# Run with coverage
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests \
  npm test -- --coverage --watchAll=false

# Run specific test file
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests \
  npm test -- __tests__/unit/components/FileUpload.test.tsx
```

### Frontend E2E Tests

```bash
# Run all Playwright tests
docker-compose -f docker-compose.test.yml up --abort-on-container-exit frontend_e2e_tests

# Run in headed mode (with browser UI)
docker-compose -f docker-compose.test.yml run --rm frontend_e2e_tests \
  npx playwright test --headed

# Run specific test file
docker-compose -f docker-compose.test.yml run --rm frontend_e2e_tests \
  npx playwright test upload-workflow.spec.ts
```

## Test Database

### Automatic Setup

The test database is automatically configured:

1. **postgres_test** service starts with tmpfs (in-memory)
2. Health check ensures database is ready
3. Test fixtures create schema automatically (see `backend/tests/conftest.py`)
4. Each test gets a fresh database session

### Database Configuration

**Connection URL**:
```
postgresql+asyncpg://voiceapp:voiceapp@postgres_test:5432/voiceapp_test
```

**Features**:
- **tmpfs storage**: 10x faster than disk (all data in RAM)
- **Isolated**: Separate from development database
- **Ephemeral**: Data deleted when container stops
- **No port exposure**: Only accessible to test containers

### Database Fixtures

From `backend/tests/conftest.py`:

```python
@pytest.fixture(scope="function")
async def db_session():
    # Creates fresh database for each test
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()
```

Each test gets:
- Clean database (no data from previous tests)
- Automatic rollback after test
- Isolated transactions

## Coverage Reports

### Generate Coverage

Coverage is automatically generated when running tests:

```bash
# Backend coverage (HTML report)
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests

# Frontend coverage
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests \
  npm test -- --coverage --watchAll=false
```

### Extract Coverage Reports

Coverage reports are stored in named volumes. To extract:

```bash
# Create directory for reports
mkdir -p coverage_reports

# Backend coverage
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests
CONTAINER_ID=$(docker ps -aqf "name=backend_unit_tests")
docker cp $CONTAINER_ID:/app/htmlcov ./coverage_reports/backend

# Frontend coverage
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests \
  npm test -- --coverage --watchAll=false
CONTAINER_ID=$(docker ps -aqf "name=frontend_unit_tests")
docker cp $CONTAINER_ID:/app/coverage ./coverage_reports/frontend
```

### View Coverage Reports

```bash
# Backend (open HTML report)
open coverage_reports/backend/index.html

# Frontend (open HTML report)
open coverage_reports/frontend/lcov-report/index.html
```

## Parallel Test Execution

### Run All Tests in Parallel

```bash
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

This starts all test services simultaneously:
- Backend unit tests
- Backend integration tests
- Frontend unit tests
- Frontend E2E tests (with backend_test_api)

**Expected Duration**:
- Backend unit tests: ~15 seconds
- Backend integration tests: ~30 seconds
- Frontend unit tests: ~10 seconds
- Frontend E2E tests: ~45 seconds

**Total time (parallel)**: ~45 seconds (longest running test suite)

### Sequential Execution (for debugging)

```bash
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests
docker-compose -f docker-compose.test.yml run --rm backend_integration_tests
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests
docker-compose -f docker-compose.test.yml up --abort-on-container-exit frontend_e2e_tests
```

## Writing New Tests

### Backend Unit Test Example

Create `backend/tests/unit/test_my_feature.py`:

```python
import pytest
from httpx import AsyncClient

@pytest.mark.unit
async def test_my_endpoint(authenticated_client: AsyncClient):
    """Test my new endpoint."""
    response = await authenticated_client.get("/api/v1/my-endpoint")
    assert response.status_code == 200
    assert response.json()["status"] == "success"
```

**Available fixtures** (from `conftest.py`):
- `db_session`: Fresh database session
- `client`: FastAPI AsyncClient
- `authenticated_client`: Client with API key header
- `test_api_key`: Raw API key for headers
- `test_audio_file`: Generated WAV file for uploads
- `test_video_file`: Test video file path

### Backend Integration Test Example

Create `backend/tests/integration/test_rabbitmq.py`:

```python
import pytest

@pytest.mark.integration
async def test_queue_publishing(db_session):
    """Test publishing to RabbitMQ."""
    # Test code that interacts with RabbitMQ
    pass
```

### Frontend Unit Test Example

Create `frontend/__tests__/unit/components/MyComponent.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import MyComponent from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Frontend E2E Test Example

Create `frontend/__tests__/e2e/my-workflow.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('my workflow', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page.locator('h1')).toContainText('Voice App');
});
```

## Troubleshooting

### Tests Failing Due to Database

**Symptom**: `asyncpg.exceptions.ConnectionRefusedError`

**Solution**:

1. Check postgres_test is healthy:
   ```bash
   docker-compose -f docker-compose.test.yml ps postgres_test
   ```

2. Wait longer for healthcheck:
   ```bash
   docker-compose -f docker-compose.test.yml up -d postgres_test
   sleep 10
   docker-compose -f docker-compose.test.yml run --rm backend_unit_tests
   ```

3. Check logs:
   ```bash
   docker-compose -f docker-compose.test.yml logs postgres_test
   ```

### Tests Hanging

**Symptom**: Tests start but never complete.

**Solution**:

1. Add timeout:
   ```bash
   timeout 120 docker-compose -f docker-compose.test.yml run --rm backend_unit_tests
   ```

2. Check for deadlocks in logs:
   ```bash
   docker-compose -f docker-compose.test.yml logs
   ```

3. Run with verbose output:
   ```bash
   docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
     pytest tests/unit -v -s
   ```

### Coverage Not Generated

**Symptom**: No `htmlcov` or `coverage` directory.

**Solution**: Ensure pytest/jest runs with coverage flags:

```bash
# Backend
docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
  pytest tests/unit --cov=app --cov-report=html

# Frontend
docker-compose -f docker-compose.test.yml run --rm frontend_unit_tests \
  npm test -- --coverage --watchAll=false
```

### Port Conflicts

**Symptom**: "port is already allocated"

**Solution**: Test services don't expose ports. Only E2E tests use internal networking. If you see this error, check if development services are running:

```bash
docker-compose down
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Performance Benchmarks

### Expected Test Times

| Test Suite | Expected Time | Notes |
|------------|---------------|-------|
| Backend unit tests | 10-20s | Fast, in-memory DB |
| Backend integration tests | 20-40s | Includes RabbitMQ |
| Frontend unit tests | 5-15s | Jest with jsdom |
| Frontend E2E tests | 30-60s | Playwright with real browser |
| **All tests (parallel)** | **45-60s** | Limited by slowest suite |

### Optimization Tips

1. **Use markers** to run only relevant tests:
   ```bash
   docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
     pytest -m "not slow"
   ```

2. **Parallel pytest** (already enabled with pytest-xdist):
   ```bash
   docker-compose -f docker-compose.test.yml run --rm backend_unit_tests \
     pytest -n auto tests/unit
   ```

3. **Jest parallel** (already default):
   ```bash
   npm test -- --maxWorkers=4
   ```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run all tests
        run: |
          docker-compose -f docker-compose.test.yml up --abort-on-container-exit

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage_reports/backend/coverage.xml,./coverage_reports/frontend/coverage/lcov.info
```

## Best Practices

### Do's ✅

- ✅ Run tests before pushing code
- ✅ Use markers to organize tests (`@pytest.mark.unit`)
- ✅ Write isolated tests (no shared state)
- ✅ Use fixtures for database/API client setup
- ✅ Run full test suite in CI/CD

### Don'ts ❌

- ❌ Don't commit large test files (use fixtures to generate)
- ❌ Don't skip cleanup (use `--rm` flag)
- ❌ Don't hardcode URLs (use environment variables)
- ❌ Don't run tests against production database
- ❌ Don't ignore failing tests

## Next Steps

- Read [DOCKER_DEVELOPMENT.md](./DOCKER_DEVELOPMENT.md) for development workflow
- Read [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- Check [CLAUDE.md](../CLAUDE.md) for project-specific testing patterns
