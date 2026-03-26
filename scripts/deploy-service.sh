#!/usr/bin/env bash
# Deploy a single service to production without restarting other containers.
# Usage: ./scripts/deploy-service.sh <compose-service-name>
# Example: ./scripts/deploy-service.sh kms-api
#
# Implements the mandatory pattern from CLAUDE.local.md:
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
