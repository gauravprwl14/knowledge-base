#!/usr/bin/env bash
# =============================================================================
# KMS Quick Start Script
# =============================================================================
# Starts the full KMS development stack.
# Usage:
#   ./scripts/kms-start.sh          # Start minimal (no LLM)
#   ./scripts/kms-start.sh --llm    # Start with Ollama
#   ./scripts/kms-start.sh --stop   # Stop all services
#   ./scripts/kms-start.sh --reset  # Stop and remove volumes (DESTRUCTIVE)
# =============================================================================

set -euo pipefail

COMPOSE_FILE="docker-compose.kms.yml"
ENV_FILE=".env"

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[KMS]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info() { echo -e "${BLUE}[INFO]${NC} $*"; }

# ── Detect container runtime ─────────────────────────────────────────────────
detect_runtime() {
  if command -v podman-compose &>/dev/null; then
    COMPOSE_CMD="podman-compose"
  elif command -v /opt/homebrew/bin/podman-compose &>/dev/null; then
    COMPOSE_CMD="/opt/homebrew/bin/podman-compose"
  elif command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  else
    err "No container runtime found. Install Podman Desktop (https://podman-desktop.io) or Docker."
    exit 1
  fi
  info "Using: $COMPOSE_CMD"
}

# ── Validate prerequisites ───────────────────────────────────────────────────
check_prerequisites() {
  detect_runtime

  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f ".env.example" ]]; then
      warn ".env not found. Copying from .env.example..."
      cp .env.example "$ENV_FILE"
    else
      warn ".env not found. Creating minimal .env..."
      cat > "$ENV_FILE" <<'EOF'
JWT_SECRET=kms-dev-jwt-secret-32-chars-minimum-length-ok
JWT_REFRESH_SECRET=kms-dev-refresh-secret-32-chars-minimum
API_KEY_ENCRYPTION_SECRET=kms-dev-api-key-encryption-secret-ok
EOF
    fi
    warn "Edit $ENV_FILE and set required secrets before production use."
  fi
}

# ── Commands ─────────────────────────────────────────────────────────────────
start_minimal() {
  log "Starting KMS stack (minimal — no Ollama)..."
  $COMPOSE_CMD -f "$COMPOSE_FILE" up -d --remove-orphans

  log "Waiting for services to be healthy..."
  sleep 5

  print_status
}

start_with_llm() {
  log "Starting KMS stack with Ollama LLM..."
  $COMPOSE_CMD -f "$COMPOSE_FILE" --profile llm up -d --remove-orphans

  log "Pulling Ollama models (this may take several minutes on first run)..."
  $COMPOSE_CMD -f "$COMPOSE_FILE" exec ollama \
    ollama pull nomic-embed-text || warn "Could not pull nomic-embed-text"
  $COMPOSE_CMD -f "$COMPOSE_FILE" exec ollama \
    ollama pull llama3.2:3b || warn "Could not pull llama3.2:3b"

  print_status
}

stop_services() {
  log "Stopping KMS stack..."
  $COMPOSE_CMD -f "$COMPOSE_FILE" down
  log "All services stopped."
}

reset_all() {
  warn "This will DESTROY all data including the database. Are you sure? [y/N]"
  read -r confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    log "Aborted."
    exit 0
  fi
  log "Resetting KMS stack (removing volumes)..."
  $COMPOSE_CMD -f "$COMPOSE_FILE" down -v
  log "Reset complete."
}

print_status() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  KMS Development Stack${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${BLUE}Services${NC}"
  echo -e "  Web UI:         http://localhost:3001"
  echo -e "  KMS API:        http://localhost:8000/api/v1"
  echo -e "  KMS API Docs:   http://localhost:8000/docs"
  echo -e "  Search API:     http://localhost:8001"
  echo -e "  RAG Service:    http://localhost:8002"
  echo -e "  Voice App:      http://localhost:8010"
  echo ""
  echo -e "  ${BLUE}Infrastructure${NC}"
  echo -e "  RabbitMQ UI:    http://localhost:15672  (guest/guest)"
  echo -e "  MinIO Console:  http://localhost:9001"
  echo -e "  Neo4j Browser:  http://localhost:7474"
  echo -e "  Qdrant:         http://localhost:6333/dashboard"
  echo ""
  echo -e "  ${BLUE}Observability — Grafana Labs stack${NC}"
  echo -e "  Grafana:        http://localhost:3000  (admin/admin)"
  echo -e "  Prometheus:     http://localhost:9090"
  echo -e "  Tempo:          http://localhost:3200  (traces)"
  echo -e "  Loki:           http://localhost:3100  (logs — internal)"
  echo ""
  echo -e "  ${YELLOW}Logs: $COMPOSE_CMD -f $COMPOSE_FILE logs -f [service]${NC}"
  echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  check_prerequisites

  case "${1:-}" in
    --llm)    start_with_llm ;;
    --stop)   stop_services ;;
    --reset)  reset_all ;;
    --status) print_status ;;
    "")       start_minimal ;;
    *)
      err "Unknown option: $1"
      echo "Usage: $0 [--llm|--stop|--reset|--status]"
      exit 1
      ;;
  esac
}

main "$@"
