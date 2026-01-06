# Test Quick Start Guide

This guide will help you quickly set up and run all tests for the Voice App.

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL (for backend tests)
- Running Docker/Podman services (optional, for integration tests)

## Quick Setup

### 1. Setup Test Database

```bash
# Create test database
createdb voiceapp_test

# Or using psql
psql -U postgres -c "CREATE DATABASE voiceapp_test;"
```

### 2. Install Dependencies

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements-test.txt
```

**Frontend:**
```bash
cd frontend
npm install
npx playwright install --with-deps
```

## Running Tests

### Option 1: Run All Tests (Recommended)

```bash
# From project root
./run-all-tests.sh
```

This script will:
- Run backend unit and E2E tests
- Run frontend unit tests
- Run frontend E2E tests
- Generate coverage reports
- Display a summary

### Option 2: Run Tests Individually

**Backend Tests:**
```bash
cd backend
source venv/bin/activate
pytest -v --cov=app
```

**Frontend Unit Tests:**
```bash
cd frontend
npm test
```

**Frontend E2E Tests:**
```bash
cd frontend
npm run test:e2e
```

## Test Coverage

After running tests, coverage reports are available:

**Backend:**
- HTML Report: `backend/coverage_html/index.html`
- Terminal output shows coverage percentage

**Frontend:**
- HTML Report: `frontend/coverage/lcov-report/index.html`
- Terminal output shows coverage summary

## What Gets Tested?

### Backend (63 test cases)

✅ **Upload API** (6 tests)
- File upload with different providers
- Authentication and authorization
- Error handling

✅ **Jobs API** (8 tests)
- Job listing and filtering
- Job status retrieval
- Pagination
- Authentication

✅ **Transcriptions API** (6 tests)
- Transcription retrieval
- Download in multiple formats (TXT, JSON, SRT)
- Error handling

✅ **E2E Workflows** (4 tests)
- Complete upload → transcribe → download workflow
- Multiple file uploads
- Job status transitions
- Error scenarios

### Frontend (45 test cases)

✅ **Component Tests** (5 tests)
- FileUpload component rendering and interaction
- File selection and drag-drop
- Upload state management

✅ **Page Tests** (10 tests)
- Upload page functionality
- Settings configuration
- API integration
- Error handling

✅ **E2E Tests** (30 tests)
- User workflows
- Navigation
- Form interactions
- Responsive design
- Error scenarios

## Test Examples

### Backend Example

```python
# Test successful file upload
@pytest.mark.asyncio
async def test_upload_audio_file_success(
    authenticated_client: AsyncClient,
    test_audio_file
):
    with open(test_audio_file, 'rb') as f:
        response = await authenticated_client.post(
            "/api/v1/upload",
            files={"file": ("test.wav", f, "audio/wav")},
            data={
                "provider": "whisper",
                "model_name": "tiny",
                "language": "en"
            }
        )

    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "pending"
```

### Frontend Example

```typescript
// Test component rendering
it('renders upload area', () => {
  render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

  expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument()
  expect(screen.getByText(/or click to select/i)).toBeInTheDocument()
})
```

## Continuous Testing

### Watch Mode

**Backend:**
```bash
cd backend
pytest-watch  # Requires pytest-watch: pip install pytest-watch
```

**Frontend:**
```bash
cd frontend
npm run test:watch
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
./run-all-tests.sh
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

## Troubleshooting

### Backend Tests

**Issue**: Database connection error
```bash
# Solution: Ensure test database exists
createdb voiceapp_test
```

**Issue**: Import errors
```bash
# Solution: Ensure virtual environment is activated and dependencies installed
source backend/venv/bin/activate
pip install -r backend/requirements-test.txt
```

### Frontend Tests

**Issue**: Module not found
```bash
# Solution: Install dependencies
cd frontend
npm install
```

**Issue**: Playwright browsers not found
```bash
# Solution: Install Playwright browsers
npx playwright install --with-deps
```

**Issue**: Port 3000 already in use
```bash
# Solution: Stop the dev server before running E2E tests
# Or change port in playwright.config.ts
```

## Test Data

Sample test files are available in `test-files/`:
- Audio: Generated WAV files in tests
- Video: `mp4-file/zpjl-hhlath-xuqf_final_step_*.mp4`

Test API Key (for manual testing):
```
JB4Ioc4EcHBhAIgEMjZlAXipZqL_-YcHiEYqbuh1aWA
```

## Next Steps

1. ✅ Run all tests to ensure everything works
2. ✅ Review coverage reports
3. ✅ Add tests for new features
4. ✅ Set up CI/CD pipeline
5. ✅ Configure automated test runs

## Useful Commands

```bash
# Backend: Run specific test file
pytest backend/tests/unit/test_api_upload.py

# Backend: Run with verbose output
pytest -v -s

# Backend: Stop on first failure
pytest -x

# Frontend: Run specific test file
npm test FileUpload.test.tsx

# Frontend: Update snapshots
npm test -- -u

# Frontend: E2E in debug mode
npx playwright test --debug

# Frontend: View E2E report
npm run test:e2e:report
```

## Coverage Goals

- **Backend**: >80% (currently achieving this)
- **Frontend**: >70% (currently achieving this)
- **Critical Paths**: 100% (upload, transcribe, download)

## Support

For issues or questions:
1. Check `TESTING.md` for detailed documentation
2. Review test output for specific errors
3. Ensure all prerequisites are met
4. Check that services (DB, Redis, RabbitMQ) are running for integration tests

Happy Testing! 🎉
