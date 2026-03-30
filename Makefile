.PHONY: status standup setup-hooks registry design-gate registry-sync help

# Default target
help:
	@echo "KMS Engineering Process — available targets:"
	@echo "  make status       Show all active features + worktree context"
	@echo "  make standup      Daily briefing from all worktree context files"
	@echo "  make setup-hooks  Install git hooks (run once per machine)"
	@echo "  make registry     Reminder: auto-generation not yet implemented, see TODOS.md"
	@echo "  make design-gate  Run PRD quality gate before moving feature to DESIGN stage"
	@echo "                    Usage: make design-gate PRD=docs/prd/PRD-my-feature.md"
	@echo "  make registry-sync  Sync worktree paths and branches into FEATURE_REGISTRY.md"

# Show feature registry + worktree status
status:
	@bash scripts/kms-status.sh

# Daily standup briefing — reads .gstack-context.md from all worktrees
# Shows [STALE Nh] or [ACTIVE Nh ago] label next to each worktree's last_session timestamp.
standup:
	@echo "=== KMS STANDUP — $(shell date +%Y-%m-%d) ==="
	@echo ""
	@for dir in .claude/worktrees/* .worktrees/*; do \
		ctx="$$dir/.gstack-context.md"; \
		if [ -f "$$ctx" ]; then \
			echo "--- $$(basename $$dir) ---"; \
			grep -E "^(feature|status|last_action|next_action|blockers):" "$$ctx" 2>/dev/null || true; \
			last_session=$$(grep '^last_session:' "$$ctx" | awk '{print $$2, $$3}'); \
			if [ -n "$$last_session" ]; then \
				last_ts=$$(date -d "$$last_session" +%s 2>/dev/null || echo 0); \
				now_ts=$$(date +%s); \
				age_hours=$$(( (now_ts - last_ts) / 3600 )); \
				if [ "$$age_hours" -gt 24 ]; then \
					echo "  [STALE $${age_hours}h] last_session: $$last_session"; \
				else \
					echo "  [ACTIVE $${age_hours}h ago] last_session: $$last_session"; \
				fi; \
			fi; \
			echo ""; \
		fi; \
	done
	@echo "=== END STANDUP ==="

# Install git hooks from scripts/hooks/ into .git/hooks/
setup-hooks:
	@echo "Installing git hooks..."
	@cp scripts/hooks/pre-push .git/hooks/pre-push
	@chmod +x .git/hooks/pre-push
	@echo "Hooks installed: .git/hooks/pre-push"
	@echo "Run 'git push' on a branch with docs/prd/ changes to test."

# Placeholder — auto-generation deferred (see TODOS.md TODO-004)
registry:
	@echo "Auto-generation of FEATURE_REGISTRY.md is deferred (see TODOS.md TODO-004)."
	@echo "Update FEATURE_REGISTRY.md manually or run: make status"

.PHONY: design-gate
design-gate: ## Run PRD quality gate check before moving feature to DESIGN stage
	@if [ -z "$(PRD)" ]; then echo "Usage: make design-gate PRD=docs/prd/PRD-my-feature.md"; exit 1; fi
	@bash scripts/prd-quality-check.sh "$(PRD)"

.PHONY: registry-sync
registry-sync: ## Sync worktree paths and branches into FEATURE_REGISTRY.md
	@bash scripts/registry-sync.sh
