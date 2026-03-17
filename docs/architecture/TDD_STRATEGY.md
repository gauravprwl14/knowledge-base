# TDD Strategy — Knowledge Base System

**Version**: 1.0
**Date**: 2026-03-17
**Principle**: Tests are written BEFORE implementation (Red → Green → Refactor)

---

## Philosophy

TDD is a **design practice**, not just a testing practice. Writing the test first forces:
- Clear API contracts before implementation
- Smaller, focused functions (hard-to-test = bad design)
- Faster confidence for parallel team development
- Regression safety as the system grows

**Decision (ADR-009)**: All services follow TDD. No PR is merged without tests that were written first.

---

## Test Pyramid

```
                    ┌───────────────┐
                    │   E2E Tests   │  (~10%) — Full user flows
                    │  (Playwright) │  Slow, run in CI only
                    └───────┬───────┘
                   ┌────────┴────────┐
                   │ Contract Tests  │  (~15%) — Service boundary validation
                   │    (Pact)       │  Consumer-driven
                   └────────┬────────┘
                  ┌─────────┴─────────┐
                  │ Integration Tests  │  (~25%) — Real DB, queue, cache
                  │ (testcontainers)   │  Docker-based, isolated
                  └─────────┬──────────┘
                ┌───────────┴───────────┐
                │     Unit Tests         │  (~50%) — Pure logic, mocked deps
                │ (Vitest / pytest)      │  Fast, run on every save
                └────────────────────────┘
```

---

## Python Services (scan-worker, embed-worker, rag-service, voice-app, etc.)

### Test Framework Stack

```toml
# pyproject.toml (shared across all Python services)
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = [
  "--import-mode=importlib",
  "--strict-markers",
  "-p no:warnings",
  "--cov=app",
  "--cov-report=term-missing",
  "--cov-fail-under=80"
]

[tool.coverage.run]
branch = true
omit = ["tests/*", "*/migrations/*"]

[tool.coverage.report]
fail_under = 80
```

### Dependencies

```toml
[dependency-groups]
test = [
  "pytest>=8.3",
  "pytest-asyncio>=0.24",
  "pytest-cov>=6.0",
  "factory-boy>=3.3",
  "faker>=33.0",
  "testcontainers[postgresql,rabbitmq,redis,qdrant]>=4.9",
  "httpx>=0.28",          # async HTTP client for FastAPI testing
  "respx>=0.22",          # Mock httpx requests
  "time-machine>=2.16",   # Freeze time in tests
]
```

### Directory Structure (per service)

```
scan-worker/
├── app/
│   ├── connectors/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── google_drive.py
│   │   └── local_fs.py
│   ├── services/
│   │   ├── file_scanner.py
│   │   └── metadata_extractor.py
│   └── workers/
│       └── consumer.py
├── tests/
│   ├── conftest.py           # Shared fixtures, testcontainers setup
│   ├── unit/
│   │   ├── connectors/
│   │   │   ├── test_google_drive.py
│   │   │   └── test_local_fs.py
│   │   └── services/
│   │       ├── test_file_scanner.py
│   │       └── test_metadata_extractor.py
│   ├── integration/
│   │   ├── test_scan_pipeline.py   # Full scan → DB write → queue publish
│   │   └── test_connector_live.py  # Real Google Drive (mark slow)
│   └── factories/
│       ├── file_factory.py
│       └── job_factory.py
└── pyproject.toml
```

### Unit Test Pattern (Python)

```python
# tests/unit/connectors/test_google_drive.py
"""
TDD: Write this test BEFORE implementing GoogleDriveConnector.list_files()
"""
import pytest
from unittest.mock import AsyncMock, patch
from app.connectors.google_drive import GoogleDriveConnector
from tests.factories.file_factory import FileMetadataFactory


class TestGoogleDriveConnector:
    """Tests for GoogleDriveConnector.

    Decision: Mock Google API client at the boundary.
    Why: Real API calls are flaky, rate-limited, and slow.
    """

    @pytest.fixture
    def connector(self, mock_token: str) -> GoogleDriveConnector:
        return GoogleDriveConnector(access_token=mock_token)

    async def test_list_files_returns_metadata_for_each_file(
        self,
        connector: GoogleDriveConnector,
    ) -> None:
        """Given a Drive folder with 3 files, list_files yields 3 FileMetadata."""
        # Arrange
        mock_drive_response = {
            "files": [
                {"id": "f1", "name": "doc.pdf", "mimeType": "application/pdf", "size": "12345"},
                {"id": "f2", "name": "sheet.xlsx", "mimeType": "application/vnd.google-apps.spreadsheet"},
                {"id": "f3", "name": "image.png", "mimeType": "image/png", "size": "98765"},
            ]
        }

        with patch.object(connector, "_drive_client") as mock_client:
            mock_client.files.return_value.list.return_value.execute = AsyncMock(
                return_value=mock_drive_response
            )

            # Act
            results = [file async for file in connector.list_files(folder_id="root")]

        # Assert
        assert len(results) == 3
        assert results[0].name == "doc.pdf"
        assert results[0].source_id == "f1"
        assert results[0].mime_type == "application/pdf"

    async def test_list_files_handles_pagination(self, connector: GoogleDriveConnector) -> None:
        """Given multiple pages, list_files exhausts all pages."""
        # ... (test implementation)

    async def test_list_files_raises_on_auth_error(self, connector: GoogleDriveConnector) -> None:
        """Given invalid token, raises ConnectorAuthError."""
        # ... (test implementation)
```

### Integration Test Pattern (Python with testcontainers)

```python
# tests/conftest.py
import pytest
from testcontainers.postgres import PostgresContainer
from testcontainers.rabbitmq import RabbitMqContainer
from testcontainers.redis import RedisContainer


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:17-alpine") as pg:
        yield pg


@pytest.fixture(scope="session")
def rabbitmq_container():
    with RabbitMqContainer("rabbitmq:4-management-alpine") as rmq:
        yield rmq


@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7.4-alpine") as redis:
        yield redis


# tests/integration/test_scan_pipeline.py
async def test_full_scan_pipeline_indexes_file_to_postgres(
    postgres_container,
    rabbitmq_container,
    db_session,
    scan_worker,
) -> None:
    """
    Integration: A scan job completes → file appears in kms_files table.
    Tests: scan-worker → PostgreSQL write → embed.queue publish
    """
    # Arrange
    job = ScanJobFactory(source_type="local_fs", path="/test/fixtures/sample.pdf")
    await publish_scan_message(rabbitmq_container, job)

    # Act
    await scan_worker.process_one_message()

    # Assert — file indexed in DB
    result = await db_session.execute(
        select(KmsFile).where(KmsFile.source_file_id == "sample.pdf")
    )
    indexed_file = result.scalar_one()
    assert indexed_file.name == "sample.pdf"
    assert indexed_file.status == FileStatus.INDEXED

    # Assert — embed job published to next queue
    embed_message = await consume_one_message(rabbitmq_container, "embed.queue")
    assert embed_message["file_id"] == str(indexed_file.id)
```

---

## Node.js Services (kms-api, search-api)

### Test Framework Stack

```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "supertest": "^7.0.0",
    "@nestjs/testing": "^11.0.0",
    "testcontainers": "^10.0.0",
    "faker-js": "^9.0.0",
    "pact": "^13.0.0"
  }
}
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
        statements: 80,
      },
      exclude: ['**/*.spec.ts', '**/migrations/**', '**/generated/**'],
    },
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
```

### Directory Structure (per NestJS service)

```
kms-api/
├── src/
│   └── modules/
│       ├── files/
│       │   ├── files.controller.ts
│       │   ├── files.controller.spec.ts    # Unit: controller
│       │   ├── files.service.ts
│       │   ├── files.service.spec.ts       # Unit: service
│       │   └── files.repository.ts
├── test/
│   ├── setup.ts                            # Global test setup
│   ├── helpers/
│   │   ├── app-factory.ts                  # Test app factory
│   │   └── db-cleanup.ts                  # DB cleanup between tests
│   ├── integration/
│   │   ├── files.integration.spec.ts      # Full HTTP → DB flow
│   │   └── auth.integration.spec.ts
│   ├── e2e/
│   │   └── search.e2e.spec.ts             # Full API contract tests
│   └── factories/
│       ├── user.factory.ts
│       └── file.factory.ts
└── vitest.config.ts
```

### Unit Test Pattern (NestJS)

```typescript
// src/modules/files/files.service.spec.ts
/**
 * TDD: Written before FilesService implementation.
 * Tests business logic in isolation — all dependencies mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { FilesService } from './files.service';
import { FilesRepository } from './files.repository';
import { FileFactory } from '../../test/factories/file.factory';

describe('FilesService', () => {
  let service: FilesService;
  let repository: FilesRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: FilesRepository,
          useValue: {
            findById: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(FilesService);
    repository = module.get(FilesRepository);
  });

  describe('getFileById', () => {
    it('returns the file when it exists', async () => {
      // Arrange — define expected behaviour before writing the code
      const file = FileFactory.build({ id: 'file-123', name: 'doc.pdf' });
      vi.spyOn(repository, 'findById').mockResolvedValue(file);

      // Act
      const result = await service.getFileById('file-123');

      // Assert
      expect(result).toEqual(file);
      expect(repository.findById).toHaveBeenCalledWith('file-123');
    });

    it('throws NotFoundException when file does not exist', async () => {
      vi.spyOn(repository, 'findById').mockResolvedValue(null);

      await expect(service.getFileById('nonexistent')).rejects.toThrow(
        'File not found: nonexistent'
      );
    });
  });
});
```

### Integration Test Pattern (NestJS with testcontainers)

```typescript
// test/integration/files.integration.spec.ts
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import supertest from 'supertest';

describe('Files API Integration', () => {
  let app: INestApplication;
  let pgContainer: StartedPostgreSqlContainer;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:17-alpine').start();

    const module = await Test.createTestingModule({
      imports: [
        AppModule.forRoot({
          databaseUrl: pgContainer.getConnectionUri(),
        }),
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    // Run migrations
    await runMigrations(pgContainer.getConnectionUri());
  });

  afterAll(async () => {
    await app.close();
    await pgContainer.stop();
  });

  it('POST /api/v1/files creates and returns a file', async () => {
    // Arrange
    const authToken = await createTestApiKey(app);
    const payload = { name: 'test.pdf', sourceId: 'drive-123' };

    // Act + Assert
    const response = await supertest(app.getHttpServer())
      .post('/api/v1/files')
      .set('X-API-Key', authToken)
      .send(payload)
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: 'test.pdf',
      sourceId: 'drive-123',
      status: 'pending',
    });
  });
});
```

---

## Contract Tests (Pact)

Between kms-api (consumer) and rag-service (provider):

```typescript
// test/contracts/rag-service.pact.spec.ts
import { PactV3 } from '@pact-foundation/pact';

const provider = new PactV3({
  consumer: 'kms-api',
  provider: 'rag-service',
  dir: './pacts',
});

it('asks rag-service a question and gets a cited answer', () => {
  provider
    .given('a knowledge base with AI documents')
    .uponReceiving('a question about machine learning')
    .withRequest({
      method: 'POST',
      path: '/api/v1/ask',
      body: { question: 'What is machine learning?' },
    })
    .willRespondWith({
      status: 200,
      body: {
        answer: like('Machine learning is...'),
        citations: eachLike({ file_id: string(), chunk: string() }),
      },
    });

  return provider.executeTest(async (mockServer) => {
    const client = new RagServiceClient(mockServer.url);
    const result = await client.ask('What is machine learning?');
    expect(result.citations.length).toBeGreaterThan(0);
  });
});
```

---

## E2E Tests (Playwright)

```typescript
// tests/e2e/search.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Search functionality', () => {
  test('user can search for a document and see results', async ({ page }) => {
    // Arrange — seed data via API
    await seedTestDocument({ title: 'Machine Learning Basics', content: '...' });

    // Act
    await page.goto('/search');
    await page.getByRole('searchbox').fill('machine learning');
    await page.getByRole('button', { name: 'Search' }).click();

    // Assert
    await expect(page.getByTestId('search-result-0')).toContainText(
      'Machine Learning Basics'
    );
  });

  test('RAG chat answers from indexed documents', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('textbox').fill('What is machine learning?');
    await page.keyboard.press('Enter');

    const answer = page.getByTestId('chat-answer');
    await expect(answer).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('citation-0')).toBeVisible();
  });
});
```

---

## CI Test Gates

```yaml
# .github/workflows/test.yml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [kms-api, search-api, scan-worker, embed-worker, rag-service]
    steps:
      - name: Run unit tests with coverage
        run: |
          # Each service runs its own unit tests
          # Coverage gate: 80% lines, 70% branches

  integration-tests:
    needs: unit-tests
    services:
      postgres: { image: postgres:17-alpine }
      redis: { image: redis:7.4-alpine }
      rabbitmq: { image: rabbitmq:4-management-alpine }
    steps:
      - name: Run integration tests
        run: docker compose -f docker-compose.test.yml up --abort-on-container-exit

  contract-tests:
    needs: integration-tests
    steps:
      - name: Run Pact contract tests
      - name: Publish to Pact Broker

  e2e-tests:
    needs: [unit-tests, integration-tests]
    steps:
      - name: Start full stack
        run: docker compose up -d
      - name: Run Playwright
        run: npx playwright test
```

---

## Coverage Thresholds (Non-negotiable)

| Layer | Lines | Branches | Functions |
|-------|-------|----------|-----------|
| Unit tests | 80% | 70% | 80% |
| Service integration | Key flows | — | — |
| Contract tests | All external API calls | — | — |

---

## TDD Workflow for New Features

```
1. Read the acceptance criteria (ticket)
2. Write failing unit test (Red)
3. Write minimal implementation to pass (Green)
4. Refactor (Refactor)
5. Write integration test covering the happy path
6. Write integration test covering failure paths
7. Run coverage check
8. Open PR — CI must be green before review
```

**Rule**: If you can't write a test before the code, the design needs rethinking.
