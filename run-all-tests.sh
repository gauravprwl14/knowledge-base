#!/bin/bash

# Voice App - Run All Tests Script
# This script runs all backend and frontend tests

set -e

echo "======================================"
echo "Voice App - Running All Tests"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
BACKEND_FAILED=0
FRONTEND_UNIT_FAILED=0
FRONTEND_E2E_FAILED=0

# Backend Tests
echo -e "${YELLOW}Running Backend Tests...${NC}"
echo "--------------------------------------"
cd backend

if [ ! -f "venv/bin/activate" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements-test.txt

echo "Running pytest..."
if pytest --cov=app --cov-report=term-missing --cov-report=html:coverage_html -v; then
    echo -e "${GREEN}✅ Backend tests passed!${NC}"
else
    echo -e "${RED}❌ Backend tests failed!${NC}"
    BACKEND_FAILED=1
fi

echo ""
cd ..

# Frontend Unit Tests
echo -e "${YELLOW}Running Frontend Unit Tests...${NC}"
echo "--------------------------------------"
cd frontend

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

echo "Running Jest tests..."
if npm test -- --coverage --silent; then
    echo -e "${GREEN}✅ Frontend unit tests passed!${NC}"
else
    echo -e "${RED}❌ Frontend unit tests failed!${NC}"
    FRONTEND_UNIT_FAILED=1
fi

echo ""

# Frontend E2E Tests
echo -e "${YELLOW}Running Frontend E2E Tests...${NC}"
echo "--------------------------------------"

# Check if Playwright browsers are installed
if [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo "Installing Playwright browsers..."
    npx playwright install --with-deps
fi

echo "Running Playwright tests..."
if npm run test:e2e; then
    echo -e "${GREEN}✅ Frontend E2E tests passed!${NC}"
else
    echo -e "${RED}❌ Frontend E2E tests failed!${NC}"
    FRONTEND_E2E_FAILED=1
fi

cd ..

# Summary
echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"

if [ $BACKEND_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ Backend Tests: PASSED${NC}"
else
    echo -e "${RED}❌ Backend Tests: FAILED${NC}"
fi

if [ $FRONTEND_UNIT_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend Unit Tests: PASSED${NC}"
else
    echo -e "${RED}❌ Frontend Unit Tests: FAILED${NC}"
fi

if [ $FRONTEND_E2E_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend E2E Tests: PASSED${NC}"
else
    echo -e "${RED}❌ Frontend E2E Tests: FAILED${NC}"
fi

echo ""

# Exit with failure if any tests failed
if [ $BACKEND_FAILED -eq 1 ] || [ $FRONTEND_UNIT_FAILED -eq 1 ] || [ $FRONTEND_E2E_FAILED -eq 1 ]; then
    echo -e "${RED}Some tests failed. Please check the output above.${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    exit 0
fi
