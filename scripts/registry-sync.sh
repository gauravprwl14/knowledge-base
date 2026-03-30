#!/usr/bin/env bash
# scripts/registry-sync.sh — Sync git worktree paths and branch names into FEATURE_REGISTRY.md.
# Reads `git worktree list`, skips the main worktree root, and for each remaining worktree:
#   - Reads branch name from git
#   - Optionally reads feature name from .gstack-context.md
#   - Finds the matching row in FEATURE_REGISTRY.md (by feature name or branch name)
#   - Updates the Worktree column (col 9) and Branch column (col 10) in-place
# If no matching row is found, prints a notice — does NOT add rows automatically.
#
# Usage: bash scripts/registry-sync.sh
# Or:    make registry-sync

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${REPO_ROOT}/FEATURE_REGISTRY.md"

if [ ! -f "${REGISTRY}" ]; then
  echo "ERROR: FEATURE_REGISTRY.md not found at: ${REGISTRY}"
  exit 1
fi

# ── helpers ──────────────────────────────────────────────────────────────────

# Return the path of the main (primary) worktree
main_worktree() {
  git -C "${REPO_ROOT}" worktree list 2>/dev/null | head -1 | awk '{print $1}'
}

# Given a worktree absolute path, return its relative path from REPO_ROOT
rel_path() {
  local abs="$1"
  # Strip the repo root prefix + leading slash
  echo "${abs#${REPO_ROOT}/}"
}

# ── collect worktrees ─────────────────────────────────────────────────────────

MAIN=$(main_worktree)
MAIN_REAL=$(cd "${MAIN}" && pwd -P 2>/dev/null || echo "${MAIN}")

updated=0
notices=0

echo ""
echo "REGISTRY SYNC — $(date '+%Y-%m-%d %H:%M')"
echo "Registry: ${REGISTRY}"
echo "──────────────────────────────────────────────────────────"

# git worktree list format:
#   /path/to/worktree  <sha>  [branch-name]
#   /path/to/worktree  <sha>  (detached HEAD)  ← skip these
while IFS= read -r line; do
  wt_path=$(echo "$line" | awk '{print $1}')
  branch_raw=$(echo "$line" | awk '{print $3}')

  # Normalise real path so we can compare with MAIN
  wt_real=$(cd "${wt_path}" 2>/dev/null && pwd -P || echo "${wt_path}")

  # Skip the main worktree root
  if [ "${wt_real}" = "${MAIN_REAL}" ]; then
    continue
  fi

  # Skip detached HEAD worktrees
  if [ "${branch_raw}" = "(detached" ] || [ -z "${branch_raw}" ]; then
    echo "  SKIP  ${wt_path} (detached HEAD — cannot determine branch)"
    continue
  fi

  # Strip surrounding brackets: [feat/my-branch] -> feat/my-branch
  branch="${branch_raw#[}"
  branch="${branch%]}"

  # Relative path from repo root (used for the Worktree column)
  worktree_rel=$(rel_path "${wt_path}")

  # Try to read feature name from .gstack-context.md
  ctx="${wt_path}/.gstack-context.md"
  feature_name=""
  if [ -f "${ctx}" ]; then
    feature_name=$(awk -F': ' '/^feature:/{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2; exit}' "${ctx}")
  fi

  # If no context file, derive feature name from the last path component
  if [ -z "${feature_name}" ]; then
    feature_name=$(basename "${wt_path}")
  fi

  echo "  Processing: ${worktree_rel} (branch: ${branch}, feature: ${feature_name})"

  # ── find matching row in registry ────────────────────────────────────────
  # A row matches if col 2 (Feature) equals feature_name OR col 10 (Branch) equals branch.
  # FEATURE_REGISTRY.md columns (pipe-separated, 1-indexed after splitting on |):
  #   $1=empty  $2=Feature  $3=PRD  $4=PRD Audit  $5=ADR  $6=Seq Diag
  #   $7=Tests  $8=Status   $9=Worktree  $10=Branch  $11=Notes  $12=empty

  match_found=$(awk -F'|' -v feat="${feature_name}" -v branch="${branch}" '
    /^\|/ {
      f = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", f)
      b = $10; gsub(/^[[:space:]]+|[[:space:]]+$/, "", b)
      if (f == feat || b == branch) { print NR; exit }
    }
  ' "${REGISTRY}")

  if [ -z "${match_found}" ]; then
    echo "  NOTICE  No registry row found for worktree: ${worktree_rel} (branch: ${branch})"
    notices=$(( notices + 1 ))
    continue
  fi

  # ── update Worktree (col 9) and Branch (col 10) for the matched row ───────
  tmp=$(mktemp)
  awk -F'|' -v OFS='|' \
      -v target_line="${match_found}" \
      -v new_wt=" ${worktree_rel} " \
      -v new_branch=" ${branch} " '
    NR == target_line && /^\|/ {
      # Rebuild the row with updated columns 9 and 10
      $9  = new_wt
      $10 = new_branch
      print; next
    }
    { print }
  ' "${REGISTRY}" > "${tmp}"
  mv "${tmp}" "${REGISTRY}"

  echo "  UPDATED  row ${match_found}: Worktree=${worktree_rel}, Branch=${branch}"
  updated=$(( updated + 1 ))

done < <(git -C "${REPO_ROOT}" worktree list 2>/dev/null)

echo "──────────────────────────────────────────────────────────"
echo "  Summary: ${updated} row(s) updated, ${notices} notice(s) printed."
echo ""
