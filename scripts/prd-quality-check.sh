#!/bin/sh
# scripts/prd-quality-check.sh — Standalone PRD quality gate.
# Checks a PRD file against the 10-item quality checklist.
# Usage: bash scripts/prd-quality-check.sh docs/prd/PRD-my-feature.md
# Exit code: 0 = GATE PASSED (<=2 failures), 1 = GATE BLOCKED (>2 failures)

PRD_FILE="$1"

if [ -z "$PRD_FILE" ]; then
  echo "Usage: prd-quality-check.sh <path-to-prd-file>"
  echo "Example: prd-quality-check.sh docs/prd/PRD-my-feature.md"
  exit 1
fi

if [ ! -f "$PRD_FILE" ]; then
  echo "ERROR: File not found: $PRD_FILE"
  exit 1
fi

echo ""
echo "PRD QUALITY GATE: $PRD_FILE"
echo "────────────────────────────────────────────────────────────"

fail_count=0
pass_count=0

# Helper: check one item, print PASS/FAIL, increment counters
check_item() {
  label="$1"
  pattern="$2"
  file="$3"
  if grep -qiE "${pattern}" "${file}" 2>/dev/null; then
    echo "  PASS  $label"
    pass_count=$(( pass_count + 1 ))
  else
    echo "  FAIL  $label"
    fail_count=$(( fail_count + 1 ))
  fi
}

check_item \
  "User stories (As a [role], I want [action], so that [outcome])" \
  "As a .* I want .* so that" \
  "$PRD_FILE"

check_item \
  "Happy path flows documented" \
  "happy.path|success.flow|## Flow|## Flows" \
  "$PRD_FILE"

check_item \
  "Error flows documented" \
  "error.flow|failure.case|## Error|## Errors" \
  "$PRD_FILE"

check_item \
  "Edge cases listed" \
  "edge.case|empty.state|concurrent|## Edge" \
  "$PRD_FILE"

check_item \
  "Integration contracts present" \
  "API call|endpoint|payload|## Integration" \
  "$PRD_FILE"

check_item \
  "KB error codes referenced (KB[A-Z]{3}[0-9]{4})" \
  "KB[A-Z][A-Z][A-Z][0-9]" \
  "$PRD_FILE"

check_item \
  "Test scenarios listed" \
  "test.scenario|## Test|test case" \
  "$PRD_FILE"

check_item \
  "Non-functional requirements (latency / SLO / rate-limit)" \
  "latency|SLO|rate.limit|## Non-functional" \
  "$PRD_FILE"

check_item \
  "Out of scope stated" \
  "[Oo]ut.of.[Ss]cope|## Out of [Ss]cope" \
  "$PRD_FILE"

check_item \
  "Sequence diagram referenced" \
  "sequence.diagram|mermaid|sequence-diagrams" \
  "$PRD_FILE"

echo "────────────────────────────────────────────────────────────"
echo "  Score: ${pass_count}/10 passed, ${fail_count}/10 failed"
echo ""

if [ "$fail_count" -gt 2 ]; then
  echo "  GATE BLOCKED — ${fail_count} items failed (threshold: >2)."
  echo "  Fix the PRD before advancing to the DESIGN stage."
  echo ""
  exit 1
else
  echo "  GATE PASSED — ${fail_count}/10 failures within acceptable threshold."
  echo "  Feature may advance to DESIGN stage."
  echo ""
  exit 0
fi
