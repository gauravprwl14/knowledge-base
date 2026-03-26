#!/usr/bin/env bash
# Run tests for a named service.
# Usage: ./scripts/test-service.sh <service-name>
set -euo pipefail

SERVICE="${1:-}"

if [ -z "$SERVICE" ]; then
  echo "Usage: $0 <service-name>"
  echo "Services: kms-api, frontend, search-api, scan-worker, embed-worker, rag-service, dedup-worker, graph-worker, voice-app, all"
  exit 1
fi

case "$SERVICE" in
  kms-api)
    echo "Running kms-api tests..."
    (cd kms-api && npm run test)
    ;;
  search-api)
    echo "Running search-api tests..."
    (cd search-api && npm run test)
    ;;
  frontend)
    echo "Running frontend tests..."
    (cd frontend && npx jest)
    ;;
  scan-worker|embed-worker|rag-service|dedup-worker|graph-worker|voice-app)
    echo "Running $SERVICE tests..."
    (cd "services/$SERVICE" && python -m pytest -v --tb=short)
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
