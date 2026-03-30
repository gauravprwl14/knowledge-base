# 0015 — MADR + Mermaid + TSDoc + Google Docstrings as Documentation Standards

- **Status**: Accepted
- **Date**: 2026-03-30
- **Deciders**: Architecture Team
- **Tags**: [documentation, adr, diagrams, typescript, python]

## Context and Problem Statement

The KMS monorepo spans two NestJS services (TypeScript) and six Python services. Without enforced documentation standards, ADRs, architecture diagrams, and code-level documentation diverge in format, become outdated, and are difficult for new team members to navigate. Four specific gaps needed addressing:

1. Architecture Decision Records — no standard format → decisions scattered across Slack, PR descriptions, and README files
2. Sequence / flow diagrams — inconsistent tooling (draw.io exports, screenshots, PlantUML) → diagrams not version-controlled
3. NestJS/TypeScript code docs — some endpoints have `@ApiOperation`, some do not → OpenAPI docs incomplete
4. Python code docs — inconsistent docstring styles (NumPy, Google, inline comments) → hard to generate or read

## Decision Drivers

- Diagrams must be version-controlled alongside code, not in external tools
- ADR format must be simple enough that engineers write them without friction
- Code docs must generate usable OpenAPI and IDE hover docs with minimal boilerplate
- Standards must be enforceable via linting (pre-commit hooks, CI checks)
- Free tooling only

## Considered Options

For ADRs:
- Option A: MADR (Markdown Architectural Decision Records)
- Option B: RFC-style prose documents
- Option C: Confluence wiki pages

For diagrams:
- Option A: Mermaid (Markdown-embedded)
- Option B: PlantUML
- Option C: draw.io / Lucidchart (external tools)

For NestJS docs:
- Option A: TSDoc + `@nestjs/swagger` decorators (`@ApiOperation`, `@ApiResponse`)
- Option B: JSDoc
- Option C: No standard — rely on OpenAPI spec only

For Python docs:
- Option A: Google-style docstrings
- Option B: NumPy-style docstrings
- Option C: Sphinx RST docstrings

## Decision Outcome

Chosen:
- **ADRs**: MADR format in `docs/architecture/decisions/NNNN-kebab-title.md`
- **Diagrams**: Mermaid (rendered in GitHub Markdown) in `docs/architecture/sequence-diagrams/`
- **NestJS API docs**: `@ApiOperation` + `@ApiResponse` on all controllers; TSDoc (`/** */`) on all exported classes, methods, and types
- **Python docs**: Google-style docstrings on all `def` and `class` definitions
- **PRDs**: 10-section template at `docs/workflow/PRD-TEMPLATE.md` enforced by pre-push hook

### Consequences

**Good:**
- MADR forces structured thinking: context → decision drivers → options → outcome
- Mermaid renders natively in GitHub PR reviews — no external tool access needed
- TSDoc + Swagger annotations auto-generate usable OpenAPI docs at `/docs` endpoint
- Google docstrings are readable inline and generate clean HTML via pdoc/Sphinx
- Pre-push hook validates PRDs against 10-item quality checklist before code reaches PR

**Bad / Trade-offs:**
- MADR files must be written manually — no tooling to auto-generate from code
- Mermaid has limited diagram types (no entity-relationship diagrams or C4 architecture views without plugins)
- TSDoc + Swagger annotations add boilerplate to controllers (mitigated by IDE snippets)
- Google docstrings require discipline; no Python linter enforces their presence by default (add `pydocstyle` to pre-commit)

## Pros and Cons of the Options

### ADRs: MADR — CHOSEN

- ✅ Structured Markdown; renders in GitHub without plugins
- ✅ Forces explicit trade-off analysis with "Pros and Cons of the Options" section
- ✅ Sequential numbering (`0001-`, `0002-`) makes history browsable
- ❌ No tooling to auto-detect when an ADR is needed

### ADRs: RFC-style prose

- ✅ More flexibility for complex technical discussions
- ❌ No enforced structure — quality varies by author
- ❌ Hard to compare options systematically

### Diagrams: Mermaid — CHOSEN

- ✅ Embedded in `.md` files — version-controlled alongside code
- ✅ Native GitHub rendering
- ✅ Supports sequence diagrams, flowcharts, class diagrams, state diagrams
- ❌ Limited diagram types compared to PlantUML
- ❌ Syntax errors are only caught at render time

### Diagrams: PlantUML

- ✅ More diagram types and finer layout control
- ❌ Requires Java runtime or PlantUML server to render
- ❌ Does not render natively in GitHub

### Diagrams: draw.io / Lucidchart

- ✅ WYSIWYG; non-engineers can contribute
- ❌ Binary export files are not diff-able in git
- ❌ Requires external tool access

### Python docs: Google style — CHOSEN

- ✅ Human-readable in source without rendering
- ✅ Supported by pdoc, Sphinx (`sphinx.ext.napoleon`), and most IDE doc parsers
- ✅ More readable than NumPy style for shorter functions
- ❌ Slightly more verbose than NumPy for multi-parameter functions

### Python docs: NumPy style

- ✅ Better for functions with many parameters (scientific computing convention)
- ❌ More visual noise for typical service methods with 2–4 parameters
