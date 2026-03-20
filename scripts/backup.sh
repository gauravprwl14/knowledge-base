#!/usr/bin/env bash
# =============================================================================
# KMS Production Backup Script
# =============================================================================
# Backs up PostgreSQL (full dump) and Qdrant (volume snapshot).
# Intended to run as a daily cron job:
#
#   sudo crontab -e
#   0 2 * * * /opt/kms/scripts/backup.sh >> /var/log/kms-backup.log 2>&1
#
# Requirements:
#   - docker compose V2 installed
#   - /opt/backups directory exists and is writable
#   - .env.prod exists at KMS_ROOT/.env.prod
# =============================================================================

set -euo pipefail

KMS_ROOT="${KMS_ROOT:-/opt/kms}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
ENV_FILE="${KMS_ROOT}/.env.prod"
COMPOSE_FILE="${KMS_ROOT}/docker-compose.prod.yml"
DATE=$(date +%Y%m%d-%H%M)
RETENTION_DAYS="${RETENTION_DAYS:-7}"

echo "[$(date)] Starting KMS backup..."

# Load env vars to get DB credentials
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Set KMS_ROOT or create the file."
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

mkdir -p "${BACKUP_DIR}"

# ─── PostgreSQL ───────────────────────────────────────────────────────────────

PG_BACKUP="${BACKUP_DIR}/kms-postgres-${DATE}.sql.gz"
echo "[$(date)] Dumping PostgreSQL → ${PG_BACKUP}"

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
  exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip > "${PG_BACKUP}"

echo "[$(date)] PostgreSQL backup complete: ${PG_BACKUP} ($(du -sh "${PG_BACKUP}" | cut -f1))"

# ─── Qdrant vector store ──────────────────────────────────────────────────────

QDRANT_BACKUP="${BACKUP_DIR}/kms-qdrant-${DATE}.tar.gz"
echo "[$(date)] Backing up Qdrant volume → ${QDRANT_BACKUP}"

docker run --rm \
  -v kms-prod_qdrant_data:/data:ro \
  -v "${BACKUP_DIR}:/backup" \
  alpine \
  tar czf "/backup/kms-qdrant-${DATE}.tar.gz" /data

echo "[$(date)] Qdrant backup complete: ${QDRANT_BACKUP} ($(du -sh "${QDRANT_BACKUP}" | cut -f1))"

# ─── Cleanup old backups ──────────────────────────────────────────────────────

echo "[$(date)] Removing backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "kms-*.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date)] Backup finished successfully."
