.PHONY: status standup setup-hooks registry help

# Default target
help:
	@echo "KMS Engineering Process — available targets:"
	@echo "  make status       Show all active features + worktree context"
	@echo "  make standup      Daily briefing from all worktree context files"
	@echo "  make setup-hooks  Install git hooks (run once per machine)"
	@echo "  make registry     Reminder: auto-generation not yet implemented, see TODOS.md"

# Show feature registry + worktree status
status:
	@bash scripts/kms-status.sh

# Daily standup briefing — reads .gstack-context.md from all worktrees
standup:
	@echo "=== KMS STANDUP — $(shell date +%Y-%m-%d) ==="
	@echo ""
	@for dir in .claude/worktrees/* .worktrees/*; do \
		if [ -f "$$dir/.gstack-context.md" ]; then \
			echo "--- $$(basename $$dir) ---"; \
			grep -E "^(feature|status|last_action|next_action|blockers):" "$$dir/.gstack-context.md" 2>/dev/null || true; \
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
