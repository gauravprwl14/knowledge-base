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
