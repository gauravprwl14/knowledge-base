#!/usr/bin/env bash
# scripts/kms-status.sh — Print KMS feature status table + worktree context
# Usage: ./scripts/kms-status.sh
# No external dependencies beyond standard coreutils + awk

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${REPO_ROOT}/FEATURE_REGISTRY.md"

# ── helpers ──────────────────────────────────────────────────────────────────
SEP_THICK="═══════════════════════════════════════════════════════════════════"
SEP_THIN="─────────────────────────────────────────────────────────────────"

today() { date '+%Y-%m-%d'; }

# ── header ───────────────────────────────────────────────────────────────────
echo ""
echo "KMS STATUS — $(today)"
echo "${SEP_THICK}"

# ── feature table ─────────────────────────────────────────────────────────────
if [ ! -f "${REGISTRY}" ]; then
  echo ""
  echo "  FEATURE_REGISTRY.md not found at: ${REGISTRY}"
  echo "  Create the file to enable status reporting."
  echo ""
else
  printf "%-28s %-12s %-28s %s\n" "FEATURE" "STATUS" "BRANCH" "NOTES"
  echo "${SEP_THIN}"

  # Columns: Feature(1) PRD(2) PRD_Audit(3) ADR(4) SeqDiag(5) Tests(6)
  #          Status(7) Worktree(8) Branch(9) Notes(10)
  # Table rows start after the header separator (lines beginning with |)
  # Skip the header row itself by checking if col1 == "Feature" (case-insensitive)
  awk -F'|' '
    /^\|/ {
      # strip leading/trailing whitespace from each field
      for (i=1; i<=NF; i++) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $i)
      }
      feature = $2
      status  = $8
      branch  = $10
      notes   = $11

      # skip header rows and separator rows
      if (feature == "Feature" || feature == "" || feature ~ /^[-=]+$/) next
      if (status  == "Status"  || status  == "") next

      # normalise empty branch
      if (branch == "" || branch == "—" || branch == "-") branch = "—"

      printf "%-28s %-12s %-28s %s\n", feature, status, branch, notes
    }
  ' "${REGISTRY}"
fi

echo "${SEP_THICK}"

# ── worktree context ──────────────────────────────────────────────────────────
echo ""
echo "WORKTREE CONTEXT (from .gstack-context.md files)"
echo "${SEP_THIN}"

found=0

scan_dir() {
  local dir="$1"
  [ -d "${dir}" ] || return 0
  # iterate immediate children only
  for wt in "${dir}"/*/; do
    [ -d "${wt}" ] || continue
    ctx="${wt}.gstack-context.md"
    if [ -f "${ctx}" ]; then
      found=1
      name="$(basename "${wt}")"
      next_action=$(awk -F': ' '/^next_action:/{print $2; exit}' "${ctx}")
      blockers=$(awk -F': ' '/^blockers:/{print $2; exit}' "${ctx}")
      next_action="${next_action:-—}"
      blockers="${blockers:-none}"
      printf "[%-22s] next: %-40s | blockers: %s\n" "${name}" "${next_action}" "${blockers}"
    fi
  done
}

scan_dir "${REPO_ROOT}/.claude/worktrees"
scan_dir "${REPO_ROOT}/.worktrees"

if [ "${found}" -eq 0 ]; then
  echo "  No .gstack-context.md files found in worktree directories."
fi

echo ""
