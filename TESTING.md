# Testing Documentation

This document describes the testing strategy and how to run tests for the Voice App project.

## Overview

The project includes comprehensive test coverage for both frontend and backend:

- **Backend Tests**: Unit tests, integration tests, and E2E tests using pytest
- **Frontend Tests**: Unit tests using Jest and React Testing Library, E2E tests using Playwright

## Test Structure

```
voice-app/
├── backend/
│   ├── tests/
│   │   ├── conftest.py          # Pytest fixtures and configuration
│   │   ├── unit/                # Unit tests for individual components
│   │   │   ├── test_api_upload.py
│   │   │   ├── test_api_jobs.py
│   │   │   └── test_api_transcriptions.py
│   │   ├── integration/         # Integration tests (future)
│   │   └── e2e/                 # End-to-end workflow tests
│   │       └── test_upload_transcribe_workflow.py
│   ├── pytest.ini               # Pytest configuration
│   └── requirements-test.txt    # Test dependencies
│
└── frontend/
    ├── __tests__/
    │   ├── unit/                # Unit tests
    │   │   ├── components/
    │   │   │   └── FileUpload.test.tsx
    │   │   └── app/
    │   │       └── page.test.tsx
    │   └── e2e/                 # End-to-end tests
    │       └── upload-workflow.spec.ts
    ├── jest.config.js           # Jest configuration
    ├── jest.setup.js            # Jest setup
    └── playwright.config.ts     # Playwright configuration
```

## Backend Tests

### Setup Test Environment

1. **Create test database**:
```bash
createdb voiceapp_test
```

2. **Install test dependencies**:
```bash
cd backend
pip install -r requirements-test.txt
```

### Running Backend Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/test_api_upload.py

# Run specific test
pytest tests/unit/test_api_upload.py::TestUploadEndpoint::test_upload_audio_file_success

# Run only unit tests
pytest -m unit

# Run only E2E tests
pytest -m e2e

# Verbose output
pytest -v

# Stop on first failure
pytest -x
```

### Backend Test Coverage

#### Unit Tests

**Upload API** (`test_api_upload.py`):
- ✅ Successful audio file upload
- ✅ Upload without API key (403)
- ✅ Upload with invalid API key (403)
- ✅ Upload without file (422)
- ✅ Upload with invalid provider
- ✅ Upload with different providers (whisper, groq, deepgram)

**Jobs API** (`test_api_jobs.py`):
- ✅ List jobs when empty
- ✅ List jobs with data
- ✅ Get job by ID
- ✅ Get non-existent job (404)
- ✅ Get job without authentication (403)
- ✅ Jobs pagination
- ✅ Filter jobs by status

**Transcriptions API** (`test_api_transcriptions.py`):
- ✅ List transcriptions when empty
- ✅ Get transcription by ID
- ✅ Download transcription as TXT
- ✅ Download transcription as JSON
- ✅ Download transcription as SRT
- ✅ Download with invalid format (400)

#### End-to-End Tests

**Upload & Transcribe Workflow** (`test_upload_transcribe_workflow.py`):
- ✅ Complete workflow from upload to download
- ✅ Multiple file upload workflow
- ✅ Error handling workflow
- ✅ Job status transitions (pending → processing → completed)

## Frontend Tests

### Setup Test Environment

```bash
cd frontend
npm install
```

### Running Frontend Tests

#### Unit Tests (Jest)

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test FileUpload.test.tsx
```

#### E2E Tests (Playwright)

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# View test report
npm run test:e2e:report
```

### Frontend Test Coverage

#### Unit Tests

**FileUpload Component** (`FileUpload.test.tsx`):
- ✅ Renders upload area
- ✅ Shows uploading state
- ✅ Accepts file selection
- ✅ Accepts multiple files
- ✅ Displays correct file type acceptance

**Upload Page** (`page.test.tsx`):
- ✅ Renders upload page with title
- ✅ Renders settings section
- ✅ Allows entering API key
- ✅ Allows selecting provider, model, language
- ✅ Shows error when upload fails without API key
- ✅ Uploads file successfully with API key
- ✅ Displays uploaded files
- ✅ Handles upload errors correctly

#### E2E Tests

**Upload Workflow** (`upload-workflow.spec.ts`):
- ✅ Displays upload page correctly
- ✅ Has settings section
- ✅ Allows entering API key
- ✅ Allows selecting provider, model, language
- ✅ Navigates to jobs page
- ✅ Shows drag and drop area
- ✅ Displays file type support message

**Jobs Page**:
- ✅ Displays jobs page correctly
- ✅ Has navigation back to upload

**Error Handling**:
- ✅ Shows error when uploading without API key

**Responsive Design**:
- ✅ Responsive on mobile (375x667)
- ✅ Responsive on tablet (768x1024)

## Test Data

### Test Files

Located in `/Users/gauravporwal/Sites/projects/rnd/voice-app/test-files/`:

- **Audio files**: `test-audio.wav` (generated in tests)
- **Video files**: `mp4-file/zpjl-hhlath-xuqf_final_step_*.mp4`

### Test API Key

For testing purposes, use:
- **API Key**: `JB4Ioc4EcHBhAIgEMjZlAXipZqL_-YcHiEYqbuh1aWA`

## Continuous Integration

### GitHub Actions (Example)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements-test.txt
      - name: Run tests
        run: |
          cd backend
          pytest --cov=app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      - name: Run unit tests
        run: |
          cd frontend
          npm test -- --coverage
      - name: Run E2E tests
        run: |
          cd frontend
          npx playwright install --with-deps
          npm run test:e2e
```

## Best Practices

### Backend Testing

1. **Use fixtures**: Leverage pytest fixtures for common setup (database, API clients, test data)
2. **Test isolation**: Each test should be independent and not rely on other tests
3. **Mock external services**: Mock calls to Groq, Deepgram, OpenAI APIs in unit tests
4. **Test edge cases**: Test error conditions, invalid inputs, and boundary cases
5. **Use meaningful assertions**: Assert on specific values, not just status codes

### Frontend Testing

1. **Test user behavior**: Test what users see and do, not implementation details
2. **Use testing-library queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Avoid testing internals**: Don't test state or props directly
4. **Mock API calls**: Use `jest.fn()` to mock fetch calls
5. **Test accessibility**: Ensure components are accessible

## Debugging Tests

### Backend

```bash
# Run with debugger
pytest --pdb

# Print output
pytest -s

# Run specific test with verbose output
pytest -v -s tests/unit/test_api_upload.py::TestUploadEndpoint::test_upload_audio_file_success
```

### Frontend

```bash
# Run Jest in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand

# Run Playwright in debug mode
npx playwright test --debug
```

## Coverage Goals

- **Backend**: Aim for >80% code coverage
- **Frontend**: Aim for >70% code coverage
- **Critical paths**: 100% coverage for upload, transcription, and download workflows

## Running All Tests

```bash
# Backend
cd backend && pytest --cov=app

# Frontend Unit
cd frontend && npm test -- --coverage

# Frontend E2E
cd frontend && npm run test:e2e
```

## Troubleshooting

### Common Issues

1. **Database connection errors**: Ensure test database exists and is accessible
2. **Port conflicts**: Make sure test servers aren't conflicting with running instances
3. **Timeout errors**: Increase timeout for slow tests
4. **Flaky tests**: Use retry mechanisms for E2E tests

### Environment Variables

Tests use the following environment variables:

**Backend**:
- `TEST_DATABASE_URL`: Test database connection string
- `RABBITMQ_URL`: RabbitMQ connection for integration tests

**Frontend**:
- `NEXT_PUBLIC_API_URL`: API base URL (defaults to `http://localhost:8000`)

## Next Steps

1. Add integration tests for worker + queue
2. Add performance tests
3. Add load testing
4. Set up automated test runs in CI/CD
5. Add visual regression testing
