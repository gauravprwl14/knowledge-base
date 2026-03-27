# ADR-0030: `@kb/ui` as a Standalone Monorepo Package

**Date**: 2026-03-27
**Status**: Accepted
**Deciders**: Gaurav (Ved)

---

## Context

The KMS frontend needs a design system to ensure consistent UI across the file browser, chat interface, search results, and future surfaces (mobile app, admin panel). The question is where to house the component library:

1. **In `frontend/components/`** — simplest setup, zero monorepo wiring, but not shareable with future apps
2. **In `packages/ui`** — monorepo package (`@kb/ui`), shareable with any React app, requires workspace setup
3. **As multiple sub-packages** — e.g., `@kb/ui-tokens`, `@kb/ui-primitives` — maximum isolation, maximum overhead

---

## Decision

Create a single `packages/ui` directory with `name: "@kb/ui"` in `package.json`. Configure it as a monorepo workspace package linked via npm/yarn workspaces and TypeScript path aliases.

```
packages/ui/
├── src/
│   ├── tokens/         ← design tokens only, no JSX
│   ├── primitives/     ← domain-agnostic single-responsibility components
│   ├── composites/     ← composed from primitives, includes viewers
│   └── index.ts        ← single barrel export
├── package.json        ← name: "@kb/ui"
└── tsconfig.json
```

---

## Rationale

**Why not `frontend/components/`?**
- A future mobile app (React Native) or admin panel built in a separate Next.js app cannot import from a path inside `frontend/`. It would require copy-pasting or a painful extraction later.
- The file rendering engine and design system are explicitly infrastructure — they serve multiple products, not one.

**Why not multiple sub-packages?**
- This is a solo-built product with ~2–6 hrs/day. Maintaining separate package versions, changelogs, and inter-package dependencies across `@kb/ui-tokens`, `@kb/ui-primitives`, `@kb/ui-viewers` is engineering overhead with no current benefit. A single `@kb/ui` with internal layering (enforced by `frontend/CLAUDE.md`) achieves the same separation without the overhead.

**Why `@kb/ui` now rather than extracting later?**
- "Extract later" does not happen in solo projects. The extraction cost grows quadratically with the number of components. Doing it correctly from the start costs one sprint of scaffold work and pays off from Sprint 2 onward.

---

## Consequences

**Positive:**
- Any future app imports `from '@kb/ui'` with zero changes to the package
- Enforces the 4-layer component hierarchy defined in `frontend/CLAUDE.md`
- Enables Storybook to be run against `packages/ui` independently of the Next.js app

**Negative:**
- Requires monorepo workspace configuration in root `package.json` and TypeScript path aliases in each consumer's `tsconfig.json`
- Build pipeline must be updated to include `packages/ui` in watch mode during development

---

## Implementation Notes

Root `package.json` workspace config:
```json
{
  "workspaces": ["packages/*", "frontend", "kms-api", "search-api"]
}
```

`frontend/tsconfig.json` path alias:
```json
{
  "compilerOptions": {
    "paths": {
      "@kb/ui": ["../packages/ui/src/index.ts"],
      "@kb/ui/*": ["../packages/ui/src/*"]
    }
  }
}
```

`packages/ui/package.json`:
```json
{
  "name": "@kb/ui",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "sideEffects": ["*.css"]
}
```
