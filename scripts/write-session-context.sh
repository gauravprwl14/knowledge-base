#!/usr/bin/env bash
# scripts/write-session-context.sh — Called by Claude Code stop hook.
# Writes or updates .gstack-context.md in the current worktree directory.
# Silent on success; prints to stderr on error.

set -euo pipefail

CONTEXT_FILE=".gstack-context.md"

# ── rate-limit guard (skip if written <5 min ago) ────────────────────────────
if [ -f "${CONTEXT_FILE}" ]; then
  last_write=$(stat -c %Y "${CONTEXT_FILE}" 2>/dev/null || echo 0)
  now=$(date +%s)
  age=$(( now - last_write ))
  if [ "${age}" -lt 300 ]; then
    exit 0
  fi
fi

# ── skip if we are in the main worktree root ──────────────────────────────────
MAIN=$(git worktree list 2>/dev/null | head -1 | awk '{print $1}')
if [ -n "${MAIN}" ]; then
  main_real=$(cd "${MAIN}" && pwd -P 2>/dev/null || echo "")
  here_real=$(pwd -P)
  if [ "${here_real}" = "${main_real}" ]; then
    exit 0
  fi
fi

# ── write or update .gstack-context.md ───────────────────────────────────────
NOW=$(date '+%Y-%m-%d %H:%M')
FEATURE=$(basename "$(pwd)")
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

if [ -f "${CONTEXT_FILE}" ]; then
  # File exists — update only the last_session field
  # Use a temp file to avoid partial writes
  tmp=$(mktemp)
  awk -v now="${NOW}" '
    /^last_session:/ { print "last_session: " now; next }
    { print }
  ' "${CONTEXT_FILE}" > "${tmp}"
  mv "${tmp}" "${CONTEXT_FILE}"
else
  # File does not exist — create with full template
  cat > "${CONTEXT_FILE}" <<EOF
# Session Context — ${FEATURE}
feature: ${FEATURE}
branch: ${BRANCH}
last_session: ${NOW}
status: IMPL
last_action: session started
next_action: continue implementation
test_status: unknown
blockers: none
EOF
fi
