#!/usr/bin/env bash
# =============================================================================
# KMS Multi-Agent Install Script
# =============================================================================
#
# Installs Claude Code skills from docs/agents/ source into .claude/skills/
#
# Usage:
#   bash docs/agents/install.sh --minimal    # Install coordinator only (1 agent)
#   bash docs/agents/install.sh --standard   # Install standard set (5 agents)
#   bash docs/agents/install.sh --full       # Install all 15 agents
#   bash docs/agents/install.sh --clean      # Remove all kb-* skills (keeps protected)
#   bash docs/agents/install.sh --list       # List installed kb-* skills
#   bash docs/agents/install.sh --help       # Show this help
#
# After install, invoke via Claude Code:
#   /kb-coordinate "Add hybrid search caching"
#
# chmod +x docs/agents/install.sh  (to make it directly executable)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SKILLS_DIR="${REPO_ROOT}/.claude/skills"
SOURCE_DIR="${SCRIPT_DIR}"

# Protected skills — never removed by --clean
# These are utility skills that must always be available
PROTECTED_SKILLS=(
  "lint-docs"
  "onboard"
  "new-feature-guide"
  "sync-docs"
)

# ---------------------------------------------------------------------------
# Agent Definitions
# Format: "skill-name|source-path-relative-to-docs/agents|description|<arg-hint>"
# ---------------------------------------------------------------------------

# --minimal: coordinator only
MINIMAL_AGENTS=(
  "kb-coordinate|orchestrator/coordinator.md|Classify problems, select specialist agents, sequence multi-service workflows|<problem-statement>"
)

# --standard: coordinator + core specialists for day-to-day development
STANDARD_AGENTS=(
  "kb-coordinate|orchestrator/coordinator.md|Classify problems, select specialist agents, sequence multi-service workflows|<problem-statement>"
  "kb-architect|architecture/solution-architect.md|Microservice system design, component diagrams, integration strategy for KMS|<design-task>"
  "kb-backend-lead|backend/backend-lead.md|NestJS modules, TypeORM patterns, service implementation for kms-api|<implementation-task>"
  "kb-db-specialist|backend/db-specialist.md|PostgreSQL schema, TypeORM entities, migrations, query optimization|<database-task>"
  "kb-qa-architect|quality/qa-architect.md|Test strategy, pytest patterns, Jest/RTL, Playwright E2E, coverage analysis|<testing-task>"
)

# --full: all 15 specialized agents
FULL_AGENTS=(
  "kb-coordinate|orchestrator/coordinator.md|Classify problems, select specialist agents, sequence multi-service workflows|<problem-statement>"
  "kb-architect|architecture/solution-architect.md|Microservice system design, component diagrams, integration strategy for KMS|<design-task>"
  "kb-product-manager|architecture/product-manager.md|Feature prioritization, milestone planning, user story definition|<product-question>"
  "kb-backend-lead|backend/backend-lead.md|NestJS modules, TypeORM patterns, service implementation for kms-api|<implementation-task>"
  "kb-python-lead|backend/python-lead.md|Python worker services, FastAPI endpoints, async job processing|<python-task>"
  "kb-api-designer|backend/api-designer.md|REST API contracts, endpoint design, validation schemas, error mapping|<api-task>"
  "kb-db-specialist|backend/db-specialist.md|PostgreSQL schema, TypeORM entities, migrations, query optimization|<database-task>"
  "kb-search-specialist|domain/search-specialist.md|Hybrid search implementation, Qdrant integration, RRF algorithm, cache strategy|<search-task>"
  "kb-voice-specialist|domain/voice-specialist.md|Transcription provider integration, job lifecycle, worker patterns|<voice-task>"
  "kb-embedding-specialist|domain/embedding-specialist.md|Content extraction, text chunking, sentence-transformers, Qdrant indexing|<embedding-task>"
  "kb-platform-engineer|devops/platform-engineer.md|Docker Compose multi-service, CI/CD pipelines, environment configuration|<platform-task>"
  "kb-observability|devops/observability.md|OpenTelemetry instrumentation, Jaeger tracing, Prometheus metrics, Grafana dashboards|<observability-task>"
  "kb-qa-architect|quality/qa-architect.md|Test strategy, pytest patterns, Jest/RTL, Playwright E2E, coverage analysis|<testing-task>"
  "kb-security-review|quality/security-review.md|Security audit, API key auth, OWASP checks, PII handling, threat modeling|<security-concern>"
  "kb-doc-engineer|delivery/doc-engineer.md|3-layer documentation system maintenance, CONTEXT.md updates, feature guide creation|<doc-task>"
)

# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------

is_protected() {
  local skill_name="$1"
  for protected in "${PROTECTED_SKILLS[@]}"; do
    if [[ "$skill_name" == "$protected" ]]; then
      return 0
    fi
  done
  return 1
}

install_agent() {
  local entry="$1"

  # Parse the pipe-delimited entry
  local skill_name source_rel description arg_hint
  skill_name="$(echo "$entry" | cut -d'|' -f1)"
  source_rel="$(echo "$entry" | cut -d'|' -f2)"
  description="$(echo "$entry" | cut -d'|' -f3)"
  arg_hint="$(echo "$entry" | cut -d'|' -f4)"

  local source_file="${SOURCE_DIR}/${source_rel}"
  local dest_file="${SKILLS_DIR}/${skill_name}.md"

  # Verify source file exists
  if [[ ! -f "$source_file" ]]; then
    echo "  WARNING: Source file not found: ${source_file}" >&2
    echo "           Skipping /${skill_name}"
    return 0
  fi

  # Copy source to skills directory
  cp "$source_file" "$dest_file"
  echo "  [OK] /${skill_name}  —  ${description}"
}

do_install() {
  local mode="$1"
  local agents=()

  case "$mode" in
    minimal)
      agents=("${MINIMAL_AGENTS[@]}")
      echo "Installing minimal set (1 agent)..."
      ;;
    standard)
      agents=("${STANDARD_AGENTS[@]}")
      echo "Installing standard set (5 agents)..."
      ;;
    full)
      agents=("${FULL_AGENTS[@]}")
      echo "Installing full set (15 agents)..."
      ;;
    *)
      echo "ERROR: Unknown install mode: $mode" >&2
      exit 1
      ;;
  esac

  # Ensure skills directory exists
  mkdir -p "$SKILLS_DIR"

  echo ""
  for entry in "${agents[@]}"; do
    install_agent "$entry"
  done

  echo ""
  echo "Done. ${#agents[@]} agent(s) installed to: ${SKILLS_DIR}"
  echo ""
  echo "Try: /kb-coordinate \"Add hybrid search caching\""
}

do_clean() {
  echo "Cleaning installed kb-* skills..."
  echo "(Protected skills will not be removed: ${PROTECTED_SKILLS[*]})"
  echo ""

  if [[ ! -d "$SKILLS_DIR" ]]; then
    echo "No skills directory found at: ${SKILLS_DIR}"
    echo "Nothing to clean."
    return 0
  fi

  local removed=0
  local skipped=0

  while IFS= read -r -d '' skill_file; do
    local skill_name
    skill_name="$(basename "$skill_file" .md)"

    if is_protected "$skill_name"; then
      echo "  [SKIP] /${skill_name}  (protected)"
      skipped=$((skipped + 1))
    else
      rm "$skill_file"
      echo "  [REMOVED] /${skill_name}"
      removed=$((removed + 1))
    fi
  done < <(find "$SKILLS_DIR" -maxdepth 1 -name "kb-*.md" -print0 2>/dev/null)

  echo ""
  echo "Removed: ${removed} skill(s). Skipped (protected): ${skipped}."
}

do_list() {
  echo "Installed skills in: ${SKILLS_DIR}"
  echo ""

  if [[ ! -d "$SKILLS_DIR" ]]; then
    echo "  (skills directory not found)"
    return 0
  fi

  local count=0
  local protected_count=0

  # List kb-* skills
  echo "  Specialized agents (kb-*):"
  while IFS= read -r -d '' skill_file; do
    local skill_name
    skill_name="$(basename "$skill_file" .md)"
    echo "    /${skill_name}"
    count=$((count + 1))
  done < <(find "$SKILLS_DIR" -maxdepth 1 -name "kb-*.md" -print0 2>/dev/null | sort -z)

  if [[ $count -eq 0 ]]; then
    echo "    (none installed)"
  fi

  echo ""

  # List protected/utility skills
  echo "  Utility skills (protected):"
  while IFS= read -r -d '' skill_file; do
    local skill_name
    skill_name="$(basename "$skill_file" .md)"
    if is_protected "$skill_name"; then
      echo "    /${skill_name}  [protected]"
      protected_count=$((protected_count + 1))
    fi
  done < <(find "$SKILLS_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null | sort -z)

  if [[ $protected_count -eq 0 ]]; then
    echo "    (none installed)"
  fi

  echo ""
  echo "  Total specialized: ${count}"
  echo "  Total utility (protected): ${protected_count}"
}

do_help() {
  cat <<'HELPTEXT'
KMS Multi-Agent Install Script
===============================

USAGE
  bash docs/agents/install.sh [--minimal|--standard|--full|--clean|--list|--help]

INSTALL MODES
  --minimal    Install coordinator only (1 agent)
               Best for: quick routing without loading full skill set

  --standard   Install standard working set (5 agents):
               kb-coordinate, kb-architect, kb-backend-lead,
               kb-db-specialist, kb-qa-architect
               Best for: day-to-day feature development

  --full       Install all 15 specialized agents
               Best for: full team simulation, complex features,
               onboarding, security/doc sprints

OTHER COMMANDS
  --clean      Remove all kb-* skills from .claude/skills/
               Protected utility skills (lint-docs, onboard,
               new-feature-guide, sync-docs) are never removed.

  --list       Show all currently installed skills

  --help       Show this help message

EXAMPLES
  bash docs/agents/install.sh --full
  bash docs/agents/install.sh --standard
  bash docs/agents/install.sh --minimal
  bash docs/agents/install.sh --clean
  bash docs/agents/install.sh --list

AFTER INSTALL
  Invoke any agent via Claude Code:
    /kb-coordinate "Add semantic deduplication for ingested documents"
    /kb-search-specialist "Tune RRF k-parameter for code search"
    /kb-db-specialist "Add composite index on kms_documents"

PROTECTED SKILLS
  These are never removed by --clean:
    lint-docs, onboard, new-feature-guide, sync-docs

SOURCE FILES
  Agent definitions live in:  docs/agents/<group>/<agent>.md
  Installed skills live in:   .claude/skills/kb-<name>.md

  Never edit .claude/skills/ directly — it is generated output.
  Edit docs/agents/ and re-run install.sh.

HELPTEXT
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

case "${1:-}" in
  --minimal)
    do_install "minimal"
    ;;
  --standard)
    do_install "standard"
    ;;
  --full)
    do_install "full"
    ;;
  --clean)
    do_clean
    ;;
  --list)
    do_list
    ;;
  --help|-h|help)
    do_help
    ;;
  "")
    echo "ERROR: No mode specified." >&2
    echo "Run: bash docs/agents/install.sh --help" >&2
    exit 1
    ;;
  *)
    echo "ERROR: Unknown option: ${1}" >&2
    echo "Run: bash docs/agents/install.sh --help" >&2
    exit 1
    ;;
esac
