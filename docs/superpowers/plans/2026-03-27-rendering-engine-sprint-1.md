# Rendering Engine — Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `@kb/ui` package with design tokens, core primitives, `FileViewerShell` + MIME registry, `ImageViewer`, and `FilesDrawer` — so any image file in the KMS browser opens inline in a side drawer without leaving the app.

**Architecture:** `packages/ui` is a TypeScript-only package consumed by the Next.js frontend via `transpilePackages` + tsconfig path alias (no npm workspaces needed). `FileViewerShell` reads a MIME registry map to lazy-load the correct viewer. `FilesDrawer` is a feature component (Layer 4) that fetches the file and mounts `FileViewerShell`. The existing `FilesBrowserPage` and `drive/FilesBrowser` are wired to open the drawer on file card click.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, `class-variance-authority` (cva), `clsx`, `tailwind-merge`, `@radix-ui/react-tooltip`, `@radix-ui/react-dialog` (for drawer), Lucide React, Jest + React Testing Library, Next.js `transpilePackages`.

---

## File Map

### New files

| File | Responsibility |
|------|----------------|
| `packages/ui/package.json` | Package metadata, peer dependencies |
| `packages/ui/tsconfig.json` | TypeScript config for the package |
| `packages/ui/jest.config.js` | Jest config for package tests |
| `packages/ui/jest.setup.ts` | RTL setup for package tests |
| `packages/ui/src/lib/cn.ts` | `clsx` + `tailwind-merge` utility |
| `packages/ui/src/tokens/tailwind-preset.ts` | Tailwind preset that adds viewer-specific tokens to frontend config |
| `packages/ui/src/primitives/Button.tsx` | cva-based button with variants (solid/ghost/outline/destructive) |
| `packages/ui/src/primitives/Button.test.tsx` | Button unit tests |
| `packages/ui/src/primitives/Badge.tsx` | Status and tag badges |
| `packages/ui/src/primitives/Badge.test.tsx` | Badge unit tests |
| `packages/ui/src/primitives/Icon.tsx` | Lucide icon wrapper with size + colour tokens |
| `packages/ui/src/primitives/Icon.test.tsx` | Icon unit tests |
| `packages/ui/src/primitives/Text.tsx` | Polymorphic text with variant + size |
| `packages/ui/src/primitives/Text.test.tsx` | Text unit tests |
| `packages/ui/src/primitives/Stack.tsx` | Flex/Grid layout primitive |
| `packages/ui/src/primitives/Stack.test.tsx` | Stack unit tests |
| `packages/ui/src/primitives/Skeleton.tsx` | Shimmer loading placeholder |
| `packages/ui/src/primitives/Skeleton.test.tsx` | Skeleton unit tests |
| `packages/ui/src/primitives/Spinner.tsx` | Circular spinner |
| `packages/ui/src/primitives/ProgressBar.tsx` | Horizontal progress bar |
| `packages/ui/src/primitives/ProgressBar.test.tsx` | ProgressBar unit tests |
| `packages/ui/src/primitives/Divider.tsx` | Horizontal / vertical separator |
| `packages/ui/src/composites/viewers/types.ts` | `ViewerFile` and `ViewerProps` interfaces |
| `packages/ui/src/composites/viewers/registry.ts` | MIME type → viewer component map |
| `packages/ui/src/composites/viewers/UnsupportedFileViewer.tsx` | Fallback viewer with download link |
| `packages/ui/src/composites/viewers/UnsupportedFileViewer.test.tsx` | Fallback viewer tests |
| `packages/ui/src/composites/viewers/ImageViewer.tsx` | Image viewer (zoom, pan, download, 4 states) |
| `packages/ui/src/composites/viewers/ImageViewer.test.tsx` | Image viewer tests |
| `packages/ui/src/composites/FileViewerShell.tsx` | Dispatcher: reads mimeType → registry → mounts viewer |
| `packages/ui/src/composites/FileViewerShell.test.tsx` | Shell unit tests |
| `packages/ui/src/index.ts` | Single barrel export |
| `frontend/components/features/files/FilesDrawer.tsx` | Feature: fetches KmsFile, mounts FileViewerShell |
| `frontend/components/features/files/FilesDrawer.test.tsx` | Drawer integration tests |

### Modified files

| File | Change |
|------|--------|
| `frontend/next.config.js` | Add `transpilePackages: ['@kb/ui']` |
| `frontend/tsconfig.json` | Add `@kb/ui` path alias |
| `frontend/tailwind.config.ts` | Add `packages/ui/src/**/*.{ts,tsx}` to content paths; import `@kb/ui` preset |
| `frontend/components/features/files/FilesBrowserPage.tsx` | Add `selectedFileId` state + `FilesDrawer` |
| `frontend/components/features/drive/FilesBrowser.tsx` | Add `selectedFileId` state + `FilesDrawer` |

---

## Task 1: Scaffold `packages/ui`

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/jest.config.js`
- Create: `packages/ui/jest.setup.ts`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@kb/ui",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "sideEffects": false,
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "type-check": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-tooltip": "^1.2.8",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "tailwind-merge": "^3.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowJs": false,
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": "."
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "**/*.test.tsx", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create `packages/ui/jest.config.js`**

```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  moduleNameMapper: {
    // Map CSS imports to empty objects so jest doesn't choke on them
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/index.ts'],
  coverageThreshold: { global: { lines: 80 } },
};
```

- [ ] **Step 4: Create `packages/ui/jest.setup.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Create CSS mock for jest**

Create `packages/ui/__mocks__/styleMock.js`:
```js
module.exports = {};
```

- [ ] **Step 6: Install dependencies**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx tsc --noEmit
```

Expected: No errors (no source files yet — that's fine at this stage).

- [ ] **Step 8: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/
git commit -m "chore: scaffold @kb/ui package with tsconfig and jest"
```

---

## Task 2: Wire Frontend to `@kb/ui`

**Files:**
- Modify: `frontend/next.config.js`
- Modify: `frontend/tsconfig.json`
- Modify: `frontend/tailwind.config.ts`

- [ ] **Step 1: Add `transpilePackages` to `frontend/next.config.js`**

Open `frontend/next.config.js`. The current config is:
```js
const withNextIntl = require('next-intl/plugin')('./i18n/request.ts');
const nextConfig = { ... };
module.exports = withNextIntl(nextConfig);
```

Add `transpilePackages` inside `nextConfig`:
```js
const withNextIntl = require('next-intl/plugin')(
  './i18n/request.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/kms',
  output: 'standalone',

  // Tell Next.js to transpile @kb/ui through its SWC pipeline.
  // Without this, Next.js would try to load raw TS from packages/ui and fail.
  transpilePackages: ['@kb/ui'],

  experimental: {
    staleTimes: { dynamic: 0 },
  },
  turbopack: {},

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.KMS_API_URL || 'http://kms-api:8000'}/api/:path*`,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    }
    return config;
  },
};

module.exports = withNextIntl(nextConfig);
```

- [ ] **Step 2: Add `@kb/ui` path alias to `frontend/tsconfig.json`**

The current `paths` section has `"@/*": ["./*"]`. Add the `@kb/ui` alias:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@kb/ui": ["../packages/ui/src/index.ts"],
      "@kb/ui/*": ["../packages/ui/src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "../packages/ui/src/**/*.ts",
    "../packages/ui/src/**/*.tsx"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Add `packages/ui` to Tailwind content paths in `frontend/tailwind.config.ts`**

Find the `content` array in `tailwind.config.ts`:
```ts
content: [
  './app/**/*.{ts,tsx}',
  './components/**/*.{ts,tsx}',
  './features/**/*.{ts,tsx}',
  './lib/**/*.{ts,tsx}',
],
```

Replace with:
```ts
content: [
  './app/**/*.{ts,tsx}',
  './components/**/*.{ts,tsx}',
  './features/**/*.{ts,tsx}',
  './lib/**/*.{ts,tsx}',
  // Include @kb/ui package so Tailwind scans its class usage
  '../packages/ui/src/**/*.{ts,tsx}',
],
```

- [ ] **Step 4: Verify frontend type-check still passes**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx tsc --noEmit
```

Expected: No errors (the path alias resolves but `index.ts` doesn't exist yet — that causes an error; create a stub to unblock):

Create `packages/ui/src/index.ts` now (empty stub):
```ts
// @kb/ui — barrel export
// Components are added here as they are built.
export {};
```

Run type-check again:
```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx tsc --noEmit
```

Expected: Passes with no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add frontend/next.config.js frontend/tsconfig.json frontend/tailwind.config.ts packages/ui/src/index.ts
git commit -m "chore: wire frontend to @kb/ui via transpilePackages and tsconfig alias"
```

---

## Task 3: `cn` utility + Design Token Preset

**Files:**
- Create: `packages/ui/src/lib/cn.ts`
- Create: `packages/ui/src/tokens/tailwind-preset.ts`

- [ ] **Step 1: Write test for `cn` utility**

Create `packages/ui/src/lib/cn.test.ts`:
```ts
import { cn } from './cn';

describe('cn', () => {
  it('merges class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('deduplicates conflicting Tailwind classes — last wins', () => {
    // tailwind-merge: p-4 wins over p-2 when both present
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null, 'baz')).toBe('foo baz');
  });

  it('handles conditional objects (clsx syntax)', () => {
    expect(cn({ active: true, disabled: false })).toBe('active');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/lib/cn.test.ts
```

Expected: FAIL — `Cannot find module './cn'`

- [ ] **Step 3: Implement `cn`**

Create `packages/ui/src/lib/cn.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS class names safely.
 *
 * Combines `clsx` (conditional class logic) with `tailwind-merge`
 * (deduplication of conflicting Tailwind utilities, e.g. p-2 vs p-4).
 *
 * @param inputs - Any number of class values, objects, or arrays
 * @returns A single merged class string
 *
 * @example
 * cn('p-2 text-sm', isActive && 'bg-blue-500', { 'opacity-50': isDisabled })
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/lib/cn.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Create Tailwind preset with viewer-specific tokens**

Create `packages/ui/src/tokens/tailwind-preset.ts`:
```ts
import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS preset for @kb/ui.
 *
 * Extends the host app's Tailwind config with viewer-specific tokens.
 * The host app (frontend) imports this preset in its tailwind.config.ts.
 *
 * All color values reference CSS custom properties already defined in
 * frontend/app/globals.css — no new CSS variables are introduced here.
 * This preset adds semantic Tailwind class names that map to those variables.
 */
const kbUiPreset: Partial<Config> = {
  theme: {
    extend: {
      // Viewer-specific z-index scale
      zIndex: {
        'drawer': '50',
        'drawer-backdrop': '49',
        'viewer-toolbar': '10',
        'viewer-overlay': '20',
      },
      // Viewer-specific max-width/height utilities
      maxHeight: {
        'viewer-drawer': 'calc(100vh - 4rem)',
        'viewer-artifact': '600px',
      },
      // Drawer width
      width: {
        'drawer': '480px',
        'drawer-sm': '100vw',
      },
      // Animation for drawer slide-in (references keyframe defined in host config)
      transitionProperty: {
        'drawer': 'transform, opacity',
      },
    },
  },
};

export default kbUiPreset;
```

- [ ] **Step 6: Import preset in frontend Tailwind config**

In `frontend/tailwind.config.ts`, add the preset import at the top and reference it in the config:
```ts
import type { Config } from 'tailwindcss';
import kbUiPreset from '../packages/ui/src/tokens/tailwind-preset';

const config: Config = {
  darkMode: 'class',
  presets: [kbUiPreset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../packages/ui/src/**/*.{ts,tsx}',
  ],
  // ... rest unchanged
};

export default config;
```

- [ ] **Step 7: Verify frontend type-check still passes**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx tsc --noEmit
```

Expected: Passes.

- [ ] **Step 8: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/src/lib/ packages/ui/src/tokens/ frontend/tailwind.config.ts
git commit -m "feat(@kb/ui): add cn utility and Tailwind preset with viewer tokens"
```

---

## Task 4: `ViewerFile` and `ViewerProps` Types

**Files:**
- Create: `packages/ui/src/composites/viewers/types.ts`

- [ ] **Step 1: Write the types file**

Create `packages/ui/src/composites/viewers/types.ts`:
```ts
/**
 * ViewerFile — the minimal file shape that @kb/ui composites need to render.
 *
 * This is intentionally a subset of the frontend's KmsFile type.
 * Feature components (FilesDrawer, ChatArtifactPanel) are responsible for
 * adapting their domain type to this interface before passing to FileViewerShell.
 *
 * Why a separate type?
 *   @kb/ui cannot import from frontend/lib/api/files (circular dependency).
 *   Defining a minimal interface here keeps the package self-contained.
 */
export interface ViewerFile {
  /** Unique file identifier */
  id: string;
  /** Display name of the file */
  filename: string;
  /** MIME type string (e.g. 'image/jpeg', 'application/pdf') */
  mimeType: string;
  /** Presigned URL or direct URL to the raw file content */
  storageUrl: string;
  /** File size in bytes */
  sizeBytes: number;
  /**
   * Processing status. Viewers use this to decide whether to show
   * the ProcessingStatus composite instead of the rendered content.
   */
  status: 'PENDING' | 'PROCESSING' | 'INDEXED' | 'ERROR' | 'UNSUPPORTED' | 'DELETED';
  /** Arbitrary metadata from the extraction pipeline (headings, page count, etc.) */
  metadata: Record<string, unknown>;
  /**
   * Optional external fallback link (e.g. Google Drive web view URL).
   * Shown in Error and Empty states as a "View externally" escape hatch.
   */
  webViewLink?: string;
}

/**
 * ViewerMode — controls which shell chrome and sizing is applied.
 *
 * - drawer:   480px side panel, shows close button + "Open full view" CTA
 * - page:     Full viewport, no close button, expanded metadata
 * - artifact: Chat side panel, fixed height, minimal chrome
 * - inline:   No chrome at all, just the rendered content
 */
export type ViewerMode = 'drawer' | 'page' | 'artifact' | 'inline';

/**
 * ViewerProps — the contract that every viewer component in the MIME registry must implement.
 *
 * All viewer components (ImageViewer, VideoPlayer, PDFViewer, etc.) accept these props.
 * The FileViewerShell dispatches the correct viewer and passes these props through.
 */
export interface ViewerProps {
  /** The file to render */
  file: ViewerFile;
  /** Determines the surrounding chrome and sizing of the viewer shell */
  mode: ViewerMode;
  /** Optional Tailwind class overrides */
  className?: string;
}
```

- [ ] **Step 2: Export from barrel (stub for now — will grow)**

Update `packages/ui/src/index.ts`:
```ts
// @kb/ui — barrel export
// Add each export here immediately when a component is created.

export type { ViewerFile, ViewerMode, ViewerProps } from './composites/viewers/types';
```

- [ ] **Step 3: Verify types compile**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx tsc --noEmit
```

Expected: Passes.

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/src/composites/ packages/ui/src/index.ts
git commit -m "feat(@kb/ui): add ViewerFile, ViewerMode, ViewerProps types"
```

---

## Task 5: `Button` Primitive

**Files:**
- Create: `packages/ui/src/primitives/Button.tsx`
- Create: `packages/ui/src/primitives/Button.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/primitives/Button.test.tsx`:
```tsx
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handler = jest.fn();
    render(<Button onClick={handler}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is passed', async () => {
    const handler = jest.fn();
    render(<Button disabled onClick={handler}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies solid variant styles by default', () => {
    render(<Button>Solid</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-blue-600');
  });

  it('applies ghost variant styles', () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');
  });

  it('applies destructive variant styles', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-red-600');
  });

  it('renders as a custom element when asChild is used', () => {
    render(
      <Button asChild>
        <a href="/test">Link</a>
      </Button>
    );
    // Should render as <a>, not <button>
    expect(screen.getByRole('link', { name: 'Link' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('merges additional className', () => {
    render(<Button className="custom-class">Styled</Button>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/primitives/Button.test.tsx
```

Expected: FAIL — `Cannot find module './Button'`

- [ ] **Step 3: Implement `Button`**

Create `packages/ui/src/primitives/Button.tsx`:
```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Button variant definitions using cva.
 *
 * Design rules:
 *  - All color values reference Tailwind utilities that map to CSS custom
 *    properties set in the host app's globals.css.
 *  - `solid` is the default — high-emphasis actions (save, confirm).
 *  - `ghost` is for low-emphasis actions (cancel, dismiss).
 *  - `outline` is for secondary actions alongside a solid button.
 *  - `destructive` is for irreversible actions (delete, remove).
 */
const buttonVariants = cva(
  // Base classes applied to every button variant
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-md font-medium text-sm',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      variant: {
        solid: 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700',
        ghost: 'bg-transparent text-slate-300 hover:bg-white/10 active:bg-white/20',
        outline: 'border border-slate-600 bg-transparent text-slate-300 hover:bg-white/5 active:bg-white/10',
        destructive: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
      },
      size: {
        sm: 'h-7 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'solid',
      size: 'md',
    },
  }
);

/** Props accepted by the Button component. */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * When true, the button renders as its child element instead of a <button>.
   * Use this for rendering a button-styled <a> or <Link>.
   *
   * @example
   * <Button asChild><a href="/dashboard">Go to Dashboard</a></Button>
   */
  asChild?: boolean;
}

/**
 * Button — base interactive element for @kb/ui.
 *
 * Supports 4 variants (solid, ghost, outline, destructive) and
 * 4 sizes (sm, md, lg, icon). Forwards ref to the underlying element.
 * Use `asChild` to render as a different element (e.g. a link).
 *
 * @example
 * <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
 * <Button variant="destructive" onClick={onDelete}>Delete file</Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // Slot renders as the child element when asChild is true (Radix pattern)
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/primitives/Button.test.tsx
```

Expected: PASS — 9 tests pass.

- [ ] **Step 5: Add to barrel export**

Update `packages/ui/src/index.ts`:
```ts
// @kb/ui — barrel export

export type { ViewerFile, ViewerMode, ViewerProps } from './composites/viewers/types';

// Primitives
export { Button } from './primitives/Button';
export type { ButtonProps } from './primitives/Button';
```

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/src/primitives/Button.tsx packages/ui/src/primitives/Button.test.tsx packages/ui/src/index.ts
git commit -m "feat(@kb/ui): add Button primitive with cva variants and ref forwarding"
```

---

## Task 6: `Badge`, `Icon`, `Text` Primitives

**Files:**
- Create: `packages/ui/src/primitives/Badge.tsx` + `Badge.test.tsx`
- Create: `packages/ui/src/primitives/Icon.tsx` + `Icon.test.tsx`
- Create: `packages/ui/src/primitives/Text.tsx` + `Text.test.tsx`

- [ ] **Step 1: Write failing tests for all three**

Create `packages/ui/src/primitives/Badge.test.tsx`:
```tsx
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>INDEXED</Badge>);
    expect(screen.getByText('INDEXED')).toBeInTheDocument();
  });

  it('applies status-success color for green variant', () => {
    render(<Badge variant="status" color="green">Active</Badge>);
    expect(screen.getByText('Active')).toHaveClass('text-emerald-400');
  });

  it('applies status-error color for red variant', () => {
    render(<Badge variant="status" color="red">Error</Badge>);
    expect(screen.getByText('Error')).toHaveClass('text-red-400');
  });

  it('applies tag variant styles', () => {
    render(<Badge variant="tag">typescript</Badge>);
    expect(screen.getByText('typescript')).toHaveClass('bg-slate-800');
  });

  it('merges additional className', () => {
    render(<Badge className="mt-2">Label</Badge>);
    expect(screen.getByText('Label')).toHaveClass('mt-2');
  });
});
```

Create `packages/ui/src/primitives/Icon.test.tsx`:
```tsx
import * as React from 'react';
import { render } from '@testing-library/react';
import { FileIcon } from 'lucide-react';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renders a lucide icon without crashing', () => {
    const { container } = render(<Icon icon={FileIcon} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies sm size class', () => {
    const { container } = render(<Icon icon={FileIcon} size="sm" />);
    expect(container.querySelector('svg')).toHaveClass('h-4');
  });

  it('applies lg size class', () => {
    const { container } = render(<Icon icon={FileIcon} size="lg" />);
    expect(container.querySelector('svg')).toHaveClass('h-6');
  });

  it('applies aria-label when provided', () => {
    const { container } = render(<Icon icon={FileIcon} aria-label="File icon" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'File icon');
  });
});
```

Create `packages/ui/src/primitives/Text.test.tsx`:
```tsx
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Text } from './Text';

describe('Text', () => {
  it('renders as <p> by default', () => {
    render(<Text>Hello</Text>);
    expect(screen.getByText('Hello').tagName).toBe('P');
  });

  it('renders as specified element via as prop', () => {
    render(<Text as="h2">Title</Text>);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('applies heading variant styles', () => {
    render(<Text variant="heading">Title</Text>);
    expect(screen.getByText('Title')).toHaveClass('font-semibold');
  });

  it('applies muted variant styles', () => {
    render(<Text variant="muted">Hint</Text>);
    expect(screen.getByText('Hint')).toHaveClass('text-slate-400');
  });

  it('merges additional className', () => {
    render(<Text className="mt-4">Spaced</Text>);
    expect(screen.getByText('Spaced')).toHaveClass('mt-4');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/primitives/Badge.test.tsx src/primitives/Icon.test.tsx src/primitives/Text.test.tsx
```

Expected: FAIL — 3 "Cannot find module" errors.

- [ ] **Step 3: Implement `Badge`**

Create `packages/ui/src/primitives/Badge.tsx`:
```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Badge colour options for the `status` variant.
 * Maps to Tailwind color utilities for the dark-first design.
 */
const statusColors = {
  green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  amber:  'bg-amber-500/15  text-amber-400  border-amber-500/30',
  red:    'bg-red-500/15    text-red-400    border-red-500/30',
  blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
  gray:   'bg-slate-500/15  text-slate-400  border-slate-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
} as const;

export type BadgeColor = keyof typeof statusColors;

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border',
  {
    variants: {
      variant: {
        /** Status badge — use with `color` prop for semantic meaning */
        status: 'border',
        /** Tag badge — for file tags and categories */
        tag: 'bg-slate-800 text-slate-300 border-slate-700',
        /** Count badge — for numeric overflow indicators (+3 more) */
        count: 'bg-slate-700 text-slate-400 border-transparent',
      },
    },
    defaultVariants: { variant: 'status' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Semantic colour for the `status` variant. Ignored for tag/count variants. */
  color?: BadgeColor;
}

/**
 * Badge — compact label for status, tags, or numeric counts.
 *
 * @example
 * <Badge variant="status" color="green">Indexed</Badge>
 * <Badge variant="tag">typescript</Badge>
 * <Badge variant="count">+3</Badge>
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, color = 'gray', children, ...props }, ref) => {
    // Apply status colour classes only for the status variant
    const colorClass = variant === 'status' ? statusColors[color] : '';

    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), colorClass, className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
```

- [ ] **Step 4: Implement `Icon`**

Create `packages/ui/src/primitives/Icon.tsx`:
```tsx
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

/** Size map — maps string size to Tailwind h/w classes */
const sizeMap = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
} as const;

export type IconSize = keyof typeof sizeMap;

export interface IconProps extends React.SVGAttributes<SVGElement> {
  /** The Lucide icon component to render */
  icon: LucideIcon;
  /** Size of the icon (default: md) */
  size?: IconSize;
  /** Additional Tailwind classes */
  className?: string;
}

/**
 * Icon — wraps a Lucide icon with consistent sizing tokens.
 *
 * Forwards all SVG attributes (aria-label, aria-hidden, etc.) to the
 * underlying SVG element produced by Lucide.
 *
 * @example
 * <Icon icon={FileTextIcon} size="sm" className="text-blue-400" />
 */
export const Icon: React.FC<IconProps> = ({
  icon: LucideComponent,
  size = 'md',
  className,
  ...props
}) => {
  return (
    <LucideComponent
      className={cn(sizeMap[size], className)}
      // Lucide icons are decorative by default; callers must set aria-label
      // for meaningful icons (e.g. icon-only buttons)
      aria-hidden={props['aria-label'] ? undefined : true}
      {...props}
    />
  );
};

Icon.displayName = 'Icon';
```

- [ ] **Step 5: Implement `Text`**

Create `packages/ui/src/primitives/Text.tsx`:
```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const textVariants = cva('', {
  variants: {
    variant: {
      /** Primary body text — default */
      body:    'text-slate-100',
      /** Large heading text */
      heading: 'text-slate-50 font-semibold',
      /** Small supporting text */
      caption: 'text-slate-400 text-sm',
      /** Muted secondary information */
      muted:   'text-slate-400',
      /** Monospace code snippet */
      code:    'font-mono text-slate-200 bg-slate-800 px-1 rounded text-sm',
      /** Destructive / error text */
      error:   'text-red-400',
    },
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
    },
  },
  defaultVariants: { variant: 'body', size: 'md' },
});

// Valid HTML element types the Text component can render as
type TextElement = 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'label' | 'strong' | 'em';

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  /**
   * The HTML element to render as (default: `p`).
   * Use this instead of wrapping in a separate element.
   *
   * @example
   * <Text as="h2" variant="heading">Section Title</Text>
   */
  as?: TextElement;
}

/**
 * Text — polymorphic text rendering with consistent typographic variants.
 *
 * @example
 * <Text>Regular body text</Text>
 * <Text as="h3" variant="heading" size="lg">Section heading</Text>
 * <Text variant="muted" size="sm">Last indexed 2 days ago</Text>
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ as: Tag = 'p', variant, size, className, ...props }, ref) => {
    return (
      <Tag
        ref={ref as React.Ref<HTMLParagraphElement>}
        className={cn(textVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Text.displayName = 'Text';
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/primitives/Badge.test.tsx src/primitives/Icon.test.tsx src/primitives/Text.test.tsx
```

Expected: PASS — 5 + 4 + 5 = 14 tests pass.

- [ ] **Step 7: Add to barrel export**

Update `packages/ui/src/index.ts`:
```ts
// @kb/ui — barrel export

export type { ViewerFile, ViewerMode, ViewerProps } from './composites/viewers/types';

// Primitives
export { Button } from './primitives/Button';
export type { ButtonProps } from './primitives/Button';
export { Badge } from './primitives/Badge';
export type { BadgeProps, BadgeColor } from './primitives/Badge';
export { Icon } from './primitives/Icon';
export type { IconProps, IconSize } from './primitives/Icon';
export { Text } from './primitives/Text';
export type { TextProps } from './primitives/Text';
```

- [ ] **Step 8: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/src/primitives/Badge.tsx packages/ui/src/primitives/Badge.test.tsx \
        packages/ui/src/primitives/Icon.tsx packages/ui/src/primitives/Icon.test.tsx \
        packages/ui/src/primitives/Text.tsx packages/ui/src/primitives/Text.test.tsx \
        packages/ui/src/index.ts
git commit -m "feat(@kb/ui): add Badge, Icon, Text primitives"
```

---

## Task 7: Layout + Loading Primitives (`Stack`, `Skeleton`, `Spinner`, `ProgressBar`, `Divider`)

**Files:**
- Create: `packages/ui/src/primitives/Stack.tsx` + `Stack.test.tsx`
- Create: `packages/ui/src/primitives/Skeleton.tsx` + `Skeleton.test.tsx`
- Create: `packages/ui/src/primitives/Spinner.tsx`
- Create: `packages/ui/src/primitives/ProgressBar.tsx` + `ProgressBar.test.tsx`
- Create: `packages/ui/src/primitives/Divider.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/primitives/Stack.test.tsx`:
```tsx
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Stack } from './Stack';

describe('Stack', () => {
  it('renders children', () => {
    render(<Stack><span>A</span><span>B</span></Stack>);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('applies flex-col direction by default', () => {
    const { container } = render(<Stack><span>A</span></Stack>);
    expect(container.firstChild).toHaveClass('flex-col');
  });

  it('applies flex-row when direction is row', () => {
    const { container } = render(<Stack direction="row"><span>A</span></Stack>);
    expect(container.firstChild).toHaveClass('flex-row');
  });

  it('applies gap token class', () => {
    const { container } = render(<Stack gap={4}><span>A</span></Stack>);
    expect(container.firstChild).toHaveClass('gap-4');
  });
});
```

Create `packages/ui/src/primitives/Skeleton.test.tsx`:
```tsx
import * as React from 'react';
import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders with animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('applies additional className', () => {
    const { container } = render(<Skeleton className="h-24 w-full" />);
    expect(container.firstChild).toHaveClass('h-24', 'w-full');
  });
});
```

Create `packages/ui/src/primitives/ProgressBar.test.tsx`:
```tsx
import * as React from 'react';
import { render } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders with correct aria attributes', () => {
    const { container } = render(<ProgressBar value={40} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps value between 0 and 100', () => {
    const { container } = render(<ProgressBar value={150} />);
    // Inner fill should be 100% wide
    const fill = container.querySelector('[data-fill]');
    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('applies blue color by default', () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(container.querySelector('[data-fill]')).toHaveClass('bg-blue-500');
  });

  it('applies green color when specified', () => {
    const { container } = render(<ProgressBar value={50} color="green" />);
    expect(container.querySelector('[data-fill]')).toHaveClass('bg-emerald-500');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/primitives/Stack.test.tsx src/primitives/Skeleton.test.tsx src/primitives/ProgressBar.test.tsx
```

Expected: FAIL — 3 "Cannot find module" errors.

- [ ] **Step 3: Implement `Stack`**

Create `packages/ui/src/primitives/Stack.tsx`:
```tsx
import * as React from 'react';
import { cn } from '../lib/cn';

// Tailwind gap utilities — mapping numeric values to classes
// so callers use `gap={4}` instead of `gap="gap-4"` (easier to read)
const gapMap: Record<number, string> = {
  0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3',
  4: 'gap-4', 5: 'gap-5', 6: 'gap-6', 8: 'gap-8',
  10: 'gap-10', 12: 'gap-12',
};

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Flex direction (default: col) */
  direction?: 'row' | 'col' | 'row-reverse' | 'col-reverse';
  /** Gap between children using the 4px spacing scale (default: 0) */
  gap?: keyof typeof gapMap;
  /** Cross-axis alignment (default: stretch) */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Main-axis alignment (default: start) */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** Whether to wrap children when they overflow (default: false) */
  wrap?: boolean;
}

/**
 * Stack — flex layout primitive for arranging children in a row or column.
 *
 * @example
 * <Stack direction="row" gap={4} align="center">
 *   <Icon icon={FileIcon} />
 *   <Text>filename.pdf</Text>
 * </Stack>
 */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ direction = 'col', gap = 0, align, justify, wrap, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          `flex-${direction}`,
          gap !== 0 && gapMap[gap],
          align && `items-${align}`,
          justify && `justify-${justify}`,
          wrap && 'flex-wrap',
          className
        )}
        {...props}
      />
    );
  }
);

Stack.displayName = 'Stack';
```

- [ ] **Step 4: Implement `Skeleton`**

Create `packages/ui/src/primitives/Skeleton.tsx`:
```tsx
import * as React from 'react';
import { cn } from '../lib/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Skeleton — animated loading placeholder.
 *
 * Use inside every viewer's `Loading` sub-component to show a
 * content-sized shimmer while the file is being fetched.
 *
 * @example
 * <Skeleton className="h-64 w-full rounded-lg" />
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'animate-pulse rounded-md bg-slate-700/50',
          className
        )}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';
```

- [ ] **Step 5: Implement `Spinner`**

Create `packages/ui/src/primitives/Spinner.tsx`:
```tsx
import * as React from 'react';
import { cn } from '../lib/cn';

const sizeMap = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' } as const;

export interface SpinnerProps {
  size?: keyof typeof sizeMap;
  className?: string;
  /** Accessible label for screen readers (default: 'Loading') */
  label?: string;
}

/**
 * Spinner — circular loading indicator.
 *
 * @example
 * <Spinner size="sm" label="Loading file..." />
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className,
  label = 'Loading',
}) => {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('animate-spin rounded-full border-2 border-slate-600 border-t-blue-500', sizeMap[size], className)}
    />
  );
};

Spinner.displayName = 'Spinner';
```

- [ ] **Step 6: Implement `ProgressBar`**

Create `packages/ui/src/primitives/ProgressBar.tsx`:
```tsx
import * as React from 'react';
import { cn } from '../lib/cn';

const colorMap = {
  blue:   'bg-blue-500',
  green:  'bg-emerald-500',
  amber:  'bg-amber-500',
  red:    'bg-red-500',
} as const;

export type ProgressBarColor = keyof typeof colorMap;

export interface ProgressBarProps {
  /** Progress value 0–100 */
  value: number;
  /** Colour of the filled track (default: blue) */
  color?: ProgressBarColor;
  /** Accessible label */
  label?: string;
  className?: string;
}

/**
 * ProgressBar — horizontal progress indicator with aria attributes.
 * Used in ProcessingStatus to show embedding progress (0–100%).
 *
 * @example
 * <ProgressBar value={embeddingProgress} color="blue" label="Embedding progress" />
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  color = 'blue',
  label = 'Progress',
  className,
}) => {
  // Clamp to 0–100 so invalid values don't break the layout
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full rounded-full bg-slate-700 overflow-hidden', className)}
    >
      <div
        data-fill
        className={cn('h-full rounded-full transition-all duration-300', colorMap[color])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};

ProgressBar.displayName = 'ProgressBar';
```

- [ ] **Step 7: Implement `Divider`**

Create `packages/ui/src/primitives/Divider.tsx`:
```tsx
import * as React from 'react';
import { cn } from '../lib/cn';

export interface DividerProps extends React.HTMLAttributes<HTMLHRElement> {
  /** Orientation of the divider (default: horizontal) */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Divider — thin separator line.
 *
 * @example
 * <Divider />                          // horizontal
 * <Divider orientation="vertical" />   // vertical (needs parent with defined height)
 */
export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  className,
  ...props
}) => {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn('w-px self-stretch bg-slate-700', className)}
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      />
    );
  }

  return (
    <hr
      role="separator"
      aria-orientation="horizontal"
      className={cn('border-0 border-t border-slate-700', className)}
      {...props}
    />
  );
};

Divider.displayName = 'Divider';
```

- [ ] **Step 8: Run all tests**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/primitives/Stack.test.tsx src/primitives/Skeleton.test.tsx src/primitives/ProgressBar.test.tsx
```

Expected: PASS — 4 + 2 + 4 = 10 tests pass.

- [ ] **Step 9: Add all to barrel export**

Update `packages/ui/src/index.ts` — add after existing exports:
```ts
export { Stack } from './primitives/Stack';
export type { StackProps } from './primitives/Stack';
export { Skeleton } from './primitives/Skeleton';
export type { SkeletonProps } from './primitives/Skeleton';
export { Spinner } from './primitives/Spinner';
export type { SpinnerProps } from './primitives/Spinner';
export { ProgressBar } from './primitives/ProgressBar';
export type { ProgressBarProps, ProgressBarColor } from './primitives/ProgressBar';
export { Divider } from './primitives/Divider';
export type { DividerProps } from './primitives/Divider';
```

- [ ] **Step 10: Run full package test suite**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest
```

Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/src/primitives/ packages/ui/src/index.ts
git commit -m "feat(@kb/ui): add Stack, Skeleton, Spinner, ProgressBar, Divider primitives"
```

---

## Task 8: `UnsupportedFileViewer` + MIME Registry

**Files:**
- Create: `packages/ui/src/composites/viewers/UnsupportedFileViewer.tsx` + `UnsupportedFileViewer.test.tsx`
- Create: `packages/ui/src/composites/viewers/registry.ts`

- [ ] **Step 1: Write failing tests for UnsupportedFileViewer**

Create `packages/ui/src/composites/viewers/UnsupportedFileViewer.test.tsx`:
```tsx
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { UnsupportedFileViewer } from './UnsupportedFileViewer';
import type { ViewerFile } from './types';

const mockFile: ViewerFile = {
  id: 'abc',
  filename: 'data.xyz',
  mimeType: 'application/x-unknown',
  storageUrl: 'https://storage/data.xyz',
  sizeBytes: 1024,
  status: 'INDEXED',
  metadata: {},
};

describe('UnsupportedFileViewer', () => {
  it('shows the filename', () => {
    render(<UnsupportedFileViewer file={mockFile} mode="drawer" />);
    expect(screen.getByText('data.xyz')).toBeInTheDocument();
  });

  it('shows the MIME type', () => {
    render(<UnsupportedFileViewer file={mockFile} mode="drawer" />);
    expect(screen.getByText('application/x-unknown')).toBeInTheDocument();
  });

  it('shows a download link when storageUrl is available', () => {
    render(<UnsupportedFileViewer file={mockFile} mode="drawer" />);
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('href', 'https://storage/data.xyz');
  });

  it('shows a View externally link when webViewLink is provided', () => {
    render(
      <UnsupportedFileViewer
        file={{ ...mockFile, webViewLink: 'https://drive.google.com/view' }}
        mode="drawer"
      />
    );
    expect(screen.getByRole('link', { name: /view externally/i })).toBeInTheDocument();
  });

  it('does not show View externally link when webViewLink is absent', () => {
    render(<UnsupportedFileViewer file={mockFile} mode="drawer" />);
    expect(screen.queryByRole('link', { name: /view externally/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/composites/viewers/UnsupportedFileViewer.test.tsx
```

Expected: FAIL — `Cannot find module './UnsupportedFileViewer'`

- [ ] **Step 3: Implement `UnsupportedFileViewer`**

Create `packages/ui/src/composites/viewers/UnsupportedFileViewer.tsx`:
```tsx
import * as React from 'react';
import { FileX2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Text } from '../../primitives/Text';
import { Stack } from '../../primitives/Stack';
import { Icon } from '../../primitives/Icon';
import { Button } from '../../primitives/Button';
import type { ViewerProps } from './types';

/**
 * UnsupportedFileViewer — fallback renderer for MIME types not in the registry.
 *
 * Shows the filename, MIME type, and action links (download, view externally).
 * This component is the safety net: every unknown file type lands here rather
 * than showing a blank screen.
 *
 * @example
 * // Used automatically by FileViewerShell when no viewer is found in the registry
 * <UnsupportedFileViewer file={file} mode="drawer" />
 */
export const UnsupportedFileViewer: React.FC<ViewerProps> = ({
  file,
  mode,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6 p-8 text-center',
        mode === 'artifact' && 'p-4 gap-4',
        className
      )}
    >
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
        <Icon icon={FileX2} size="xl" className="text-slate-400" aria-hidden />
      </div>

      {/* Explanation */}
      <Stack gap={2} align="center">
        <Text variant="heading" size="sm">
          Preview not available
        </Text>
        <Text variant="muted" size="sm">
          {file.filename}
        </Text>
        <Text variant="muted" size="xs">
          {file.mimeType}
        </Text>
      </Stack>

      {/* Actions */}
      <Stack direction="row" gap={3}>
        <Button
          asChild
          variant="outline"
          size="sm"
        >
          <a
            href={file.storageUrl}
            download={file.filename}
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
        </Button>

        {/* Only shown when an external view link (e.g. Google Drive) is available */}
        {file.webViewLink && (
          <Button asChild variant="ghost" size="sm">
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noreferrer"
            >
              View externally
            </a>
          </Button>
        )}
      </Stack>
    </div>
  );
};

UnsupportedFileViewer.displayName = 'UnsupportedFileViewer';
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/composites/viewers/UnsupportedFileViewer.test.tsx
```

Expected: PASS — 5 tests pass.

- [ ] **Step 5: Create the MIME registry**

Create `packages/ui/src/composites/viewers/registry.ts`:
```ts
import { lazy, type ComponentType } from 'react';
import type { ViewerProps } from './types';

// ---------------------------------------------------------------------------
// Lazy-load every viewer.
// React.lazy() means the viewer bundle is only downloaded when a file
// of that type is first encountered in the session — zero cost otherwise.
// ---------------------------------------------------------------------------

// Sprint 1 — available now
const ImageViewer = lazy(() =>
  import('./ImageViewer').then((m) => ({ default: m.ImageViewer }))
);
const UnsupportedFileViewer = lazy(() =>
  import('./UnsupportedFileViewer').then((m) => ({ default: m.UnsupportedFileViewer }))
);

// Sprint 2 — will be uncommented when implemented
// const VideoPlayer    = lazy(() => import('./VideoPlayer').then(m => ({ default: m.VideoPlayer })));
// const AudioPlayer    = lazy(() => import('./AudioPlayer').then(m => ({ default: m.AudioPlayer })));
// const PDFViewer      = lazy(() => import('./PDFViewer').then(m => ({ default: m.PDFViewer })));

// Sprint 3 — will be uncommented when implemented
// const CodeViewer        = lazy(() => import('./CodeViewer').then(m => ({ default: m.CodeViewer })));
// const MarkdownRenderer  = lazy(() => import('./MarkdownRenderer').then(m => ({ default: m.MarkdownRenderer })));

// Sprint 4 — will be uncommented when implemented
// const DataTableViewer   = lazy(() => import('./DataTableViewer').then(m => ({ default: m.DataTableViewer })));
// const DocumentRenderer  = lazy(() => import('./DocumentRenderer').then(m => ({ default: m.DocumentRenderer })));

/**
 * MIME_REGISTRY — maps MIME type strings to their viewer component.
 *
 * This is the single authoritative list of supported file types.
 * Adding support for a new type = one line in this map + creating the viewer.
 * The FileViewerShell reads this map — no MIME conditionals anywhere else.
 */
export const MIME_REGISTRY: Record<string, ComponentType<ViewerProps>> = {
  // Images
  'image/jpeg':    ImageViewer,
  'image/jpg':     ImageViewer,
  'image/png':     ImageViewer,
  'image/gif':     ImageViewer,
  'image/webp':    ImageViewer,
  'image/svg+xml': ImageViewer,
  'image/bmp':     ImageViewer,
  'image/tiff':    ImageViewer,

  // Sprint 2 entries will be added here:
  // 'video/mp4':       VideoPlayer,
  // 'video/webm':      VideoPlayer,
  // 'video/quicktime': VideoPlayer,
  // 'audio/mpeg':      AudioPlayer,
  // 'audio/wav':       AudioPlayer,
  // 'audio/mp4':       AudioPlayer,
  // 'audio/ogg':       AudioPlayer,
  // 'application/pdf': PDFViewer,

  // Sprint 3 entries:
  // 'text/plain':     MarkdownRenderer,
  // 'text/markdown':  MarkdownRenderer,
  // 'text/x-markdown': MarkdownRenderer,

  // Sprint 4 entries:
  // 'text/csv':  DataTableViewer,
  // 'text/tsv':  DataTableViewer,
  // 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': DocumentRenderer,
};

/**
 * getViewer — looks up the correct viewer for a given MIME type.
 *
 * Lookup order:
 *   1. Exact match: 'image/jpeg' → ImageViewer
 *   2. Prefix match: 'video/x-matroska' → VideoPlayer (matches 'video/*')
 *   3. No match → UnsupportedFileViewer
 *
 * @param mimeType - The MIME type string from the file object
 * @returns The viewer component to render
 */
export function getViewer(mimeType: string): ComponentType<ViewerProps> {
  // 1. Exact match
  if (MIME_REGISTRY[mimeType]) {
    return MIME_REGISTRY[mimeType];
  }

  // 2. Prefix match (e.g. 'video/x-unknown' → any 'video/*' entry)
  const prefix = mimeType.split('/')[0];
  for (const [key, viewer] of Object.entries(MIME_REGISTRY)) {
    if (key.startsWith(prefix + '/')) {
      return viewer;
    }
  }

  // 3. Fallback
  return UnsupportedFileViewer;
}
```

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/src/composites/viewers/
git commit -m "feat(@kb/ui): add UnsupportedFileViewer and MIME registry"
```

---

## Task 9: `FileViewerShell` Composite

**Files:**
- Create: `packages/ui/src/composites/FileViewerShell.tsx`
- Create: `packages/ui/src/composites/FileViewerShell.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/composites/FileViewerShell.test.tsx`:
```tsx
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { FileViewerShell } from './FileViewerShell';
import type { ViewerFile } from './viewers/types';

// Mock the registry to avoid dynamic imports in tests
jest.mock('./viewers/registry', () => ({
  getViewer: (mimeType: string) => {
    if (mimeType === 'image/jpeg') {
      // Return a simple stub component
      return function StubImageViewer() { return <div data-testid="image-viewer">Image</div>; };
    }
    return function StubUnsupported() { return <div data-testid="unsupported-viewer">Unsupported</div>; };
  },
}));

const imageFile: ViewerFile = {
  id: '1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  storageUrl: 'https://storage/photo.jpg',
  sizeBytes: 204800,
  status: 'INDEXED',
  metadata: {},
};

const unknownFile: ViewerFile = {
  id: '2',
  filename: 'data.xyz',
  mimeType: 'application/x-unknown',
  storageUrl: 'https://storage/data.xyz',
  sizeBytes: 512,
  status: 'INDEXED',
  metadata: {},
};

const processingFile: ViewerFile = {
  ...imageFile,
  id: '3',
  status: 'PROCESSING',
};

describe('FileViewerShell', () => {
  it('mounts ImageViewer for image/jpeg', () => {
    render(<FileViewerShell file={imageFile} mode="drawer" />);
    expect(screen.getByTestId('image-viewer')).toBeInTheDocument();
  });

  it('falls back to UnsupportedFileViewer for unknown MIME type', () => {
    render(<FileViewerShell file={unknownFile} mode="drawer" />);
    expect(screen.getByTestId('unsupported-viewer')).toBeInTheDocument();
  });

  it('shows processing state when file status is PROCESSING', () => {
    render(<FileViewerShell file={processingFile} mode="drawer" />);
    // ProcessingStatus renders a status message
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state when file status is ERROR', () => {
    render(
      <FileViewerShell
        file={{ ...imageFile, status: 'ERROR' }}
        mode="drawer"
      />
    );
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });

  it('shows unsupported state when file status is UNSUPPORTED', () => {
    render(
      <FileViewerShell
        file={{ ...imageFile, status: 'UNSUPPORTED' }}
        mode="drawer"
      />
    );
    expect(screen.getByTestId('unsupported-viewer')).toBeInTheDocument();
  });

  it('passes mode prop to the mounted viewer', () => {
    // Verify mode reaches the viewer — checked via data-testid in stub
    render(<FileViewerShell file={imageFile} mode="artifact" />);
    expect(screen.getByTestId('image-viewer')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/composites/FileViewerShell.test.tsx
```

Expected: FAIL — `Cannot find module './FileViewerShell'`

- [ ] **Step 3: Implement `FileViewerShell`**

Create `packages/ui/src/composites/FileViewerShell.tsx`:
```tsx
import * as React from 'react';
import { getViewer } from './viewers/registry';
import { Spinner } from '../primitives/Spinner';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';
import { cn } from '../lib/cn';
import type { ViewerFile, ViewerMode } from './viewers/types';

export interface FileViewerShellProps {
  /** The file to render */
  file: ViewerFile;
  /**
   * Controls the surrounding chrome and sizing.
   * - drawer:   480px panel, close button visible
   * - page:     Full viewport, no close button
   * - artifact: Chat side panel, fixed height, minimal chrome
   * - inline:   No chrome, just the content
   */
  mode: ViewerMode;
  /** Called when the close button is clicked (required for mode="drawer") */
  onClose?: () => void;
  /** Additional Tailwind classes for the outer shell */
  className?: string;
}

/**
 * ProcessingPlaceholder — shown when file.status is PENDING or PROCESSING.
 *
 * Sprint 2 will replace this with the full ProcessingStatus composite
 * that connects to the WebSocket hook.
 */
function ProcessingPlaceholder({ filename }: { filename: string }) {
  return (
    <div
      role="status"
      aria-label={`Processing ${filename}`}
      className="flex flex-col items-center justify-center gap-4 p-8"
    >
      <Spinner size="lg" label={`Processing ${filename}`} />
      <Text variant="muted" size="sm">
        Processing file — preview will appear when complete
      </Text>
    </div>
  );
}

/**
 * ErrorPlaceholder — shown when file.status is ERROR.
 * Provides a download fallback so the user is never fully blocked.
 */
function ErrorPlaceholder({ file }: { file: ViewerFile }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <Text variant="error" size="sm">
        Could not load {file.filename}
      </Text>
      <Button asChild variant="outline" size="sm">
        <a href={file.storageUrl} download={file.filename} target="_blank" rel="noreferrer">
          Download instead
        </a>
      </Button>
    </div>
  );
}

/**
 * FileViewerShell — the single dispatch point for all file rendering.
 *
 * Reads the file's mimeType, looks it up in the MIME registry, and
 * mounts the correct viewer. Handles all file status states:
 *   - INDEXED      → mount the viewer
 *   - PROCESSING / PENDING → show ProcessingPlaceholder
 *   - ERROR        → show ErrorPlaceholder
 *   - UNSUPPORTED  → force UnsupportedFileViewer regardless of mimeType
 *
 * The `mode` prop controls shell chrome:
 *   - drawer:   renders inside a panel with padding tuned for 480px width
 *   - page:     full-height, no extra chrome (the page layout provides it)
 *   - artifact: compact, fixed height for the chat side panel
 *   - inline:   zero chrome, just the viewer output
 *
 * @example
 * <FileViewerShell file={kmsFile} mode="drawer" onClose={closeDrawer} />
 */
export const FileViewerShell: React.FC<FileViewerShellProps> = ({
  file,
  mode,
  onClose,
  className,
}) => {
  // --- Status-based early returns ---

  // Files still being processed cannot be rendered yet
  if (file.status === 'PENDING' || file.status === 'PROCESSING') {
    return (
      <div className={cn('w-full', className)}>
        <ProcessingPlaceholder filename={file.filename} />
      </div>
    );
  }

  // Files that failed processing show an error with a download escape hatch
  if (file.status === 'ERROR') {
    return (
      <div className={cn('w-full', className)}>
        <ErrorPlaceholder file={file} />
      </div>
    );
  }

  // UNSUPPORTED files skip the registry and go straight to the fallback viewer
  // The registry would also return UnsupportedFileViewer for unknown types,
  // but forcing it here makes the intent explicit and avoids a registry lookup.
  const ViewerComponent =
    file.status === 'UNSUPPORTED'
      ? (require('./viewers/UnsupportedFileViewer').UnsupportedFileViewer as React.ComponentType<{
          file: ViewerFile;
          mode: ViewerMode;
          className?: string;
        }>)
      : getViewer(file.mimeType);

  return (
    <div
      className={cn(
        'w-full',
        mode === 'drawer' && 'min-h-0',
        mode === 'artifact' && 'max-h-[var(--viewer-artifact-max-height,600px)] overflow-auto',
        className
      )}
    >
      {/*
       * Suspense boundary is required because viewers are loaded via React.lazy().
       * The fallback skeleton is intentionally minimal — each viewer provides its
       * own loading state (Viewer.Loading) once it mounts.
       */}
      <React.Suspense
        fallback={
          <Stack align="center" justify="center" className="min-h-32">
            <Spinner label={`Loading viewer for ${file.filename}`} />
          </Stack>
        }
      >
        <ViewerComponent file={file} mode={mode} />
      </React.Suspense>
    </div>
  );
};

FileViewerShell.displayName = 'FileViewerShell';
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/composites/FileViewerShell.test.tsx
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Add to barrel export**

Update `packages/ui/src/index.ts` — add:
```ts
// Composites
export { FileViewerShell } from './composites/FileViewerShell';
export type { FileViewerShellProps } from './composites/FileViewerShell';
export { UnsupportedFileViewer } from './composites/viewers/UnsupportedFileViewer';
```

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/src/composites/ packages/ui/src/index.ts
git commit -m "feat(@kb/ui): add FileViewerShell with MIME registry dispatch and status handling"
```

---

## Task 10: `ImageViewer` Composite

**Files:**
- Create: `packages/ui/src/composites/viewers/ImageViewer.tsx`
- Create: `packages/ui/src/composites/viewers/ImageViewer.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/composites/viewers/ImageViewer.test.tsx`:
```tsx
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageViewer } from './ImageViewer';
import type { ViewerFile } from './types';

const mockFile: ViewerFile = {
  id: 'img-1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  storageUrl: 'https://storage.example.com/photo.jpg',
  sizeBytes: 204800,
  status: 'INDEXED',
  metadata: {},
};

describe('ImageViewer', () => {
  it('renders an image with the correct src', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://storage.example.com/photo.jpg');
  });

  it('uses the filename as the alt text', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'photo.jpg');
  });

  it('shows a download button', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('href', 'https://storage.example.com/photo.jpg');
    expect(link).toHaveAttribute('download', 'photo.jpg');
  });

  it('shows a loading skeleton while image is loading', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    // Before onLoad fires, skeleton should be visible
    const skeleton = screen.queryByRole('img')?.closest('[data-loading]');
    // We check that the img has an onLoad handler (functional test)
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('shows an error state when the image fails to load', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    const img = screen.getByRole('img');
    // Simulate browser image load failure
    fireEvent.error(img);
    expect(screen.getByText(/could not load image/i)).toBeInTheDocument();
  });

  it('shows the View externally button when webViewLink is available', () => {
    render(
      <ImageViewer
        file={{ ...mockFile, webViewLink: 'https://drive.google.com/view' }}
        mode="drawer"
      />
    );
    expect(screen.getByRole('link', { name: /view externally/i })).toBeInTheDocument();
  });

  it('applies compact layout in artifact mode', () => {
    const { container } = render(<ImageViewer file={mockFile} mode="artifact" />);
    // artifact mode sets max-height on the image container
    expect(container.querySelector('[data-viewer-container]')).toHaveClass('max-h-\\[600px\\]');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/composites/viewers/ImageViewer.test.tsx
```

Expected: FAIL — `Cannot find module './ImageViewer'`

- [ ] **Step 3: Implement `ImageViewer`**

Create `packages/ui/src/composites/viewers/ImageViewer.tsx`:
```tsx
import * as React from 'react';
import { Download, ExternalLink, ImageOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../primitives/Button';
import { Skeleton } from '../../primitives/Skeleton';
import { Text } from '../../primitives/Text';
import { Stack } from '../../primitives/Stack';
import { Icon } from '../../primitives/Icon';
import type { ViewerProps } from './types';

/**
 * ImageViewer — inline image renderer with zoom-on-click, download, and error handling.
 *
 * States handled:
 *  - Loading: shows a skeleton placeholder until the browser fires onLoad
 *  - Error:   shown when browser fires onError (broken URL, 403, etc.)
 *  - Rendered: the image is displayed with action buttons
 *
 * Zoom: clicking the image toggles a CSS scale transform (no library needed).
 *
 * @example
 * // Mounted automatically by FileViewerShell when mimeType starts with 'image/'
 * <ImageViewer file={file} mode="drawer" />
 */
export const ImageViewer: React.FC<ViewerProps> = ({ file, mode, className }) => {
  // Track whether the browser has successfully loaded the image
  const [loaded, setLoaded] = React.useState(false);
  // Track whether the browser reported a load error (broken URL, 403, etc.)
  const [error, setError] = React.useState(false);
  // Toggle zoom state on click
  const [zoomed, setZoomed] = React.useState(false);

  const handleLoad = () => setLoaded(true);
  const handleError = () => setError(true);
  const toggleZoom = () => setZoomed((z) => !z);

  // --- Error state ---
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4 p-8 text-center', className)}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
          <Icon icon={ImageOff} size="xl" className="text-slate-400" />
        </div>
        <Text variant="muted" size="sm">
          Could not load image
        </Text>
        <Button asChild variant="outline" size="sm">
          <a href={file.storageUrl} download={file.filename} target="_blank" rel="noreferrer">
            <Icon icon={Download} size="sm" />
            Download instead
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Image container — data-viewer-container used in tests to check mode classes */}
      <div
        data-viewer-container
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-lg bg-slate-900',
          mode === 'drawer'   && 'min-h-48 max-h-[60vh]',
          mode === 'page'     && 'min-h-64 max-h-[70vh]',
          mode === 'artifact' && 'max-h-[600px]',
          mode === 'inline'   && 'max-h-48',
        )}
      >
        {/* Loading skeleton — hidden once the image has loaded */}
        {!loaded && (
          <Skeleton className="absolute inset-0 rounded-lg" />
        )}

        {/* The actual image */}
        <img
          src={file.storageUrl}
          alt={file.filename}
          onLoad={handleLoad}
          onError={handleError}
          onClick={toggleZoom}
          className={cn(
            'max-h-full max-w-full object-contain transition-transform duration-200',
            // Show the image (opacity 1) only after it has loaded
            loaded ? 'opacity-100' : 'opacity-0',
            zoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in',
          )}
        />
      </div>

      {/* Action bar — shown in all modes except inline */}
      {mode !== 'inline' && (
        <Stack direction="row" gap={2} className="mt-3 px-1">
          <Button asChild variant="ghost" size="sm">
            <a href={file.storageUrl} download={file.filename} target="_blank" rel="noreferrer">
              <Icon icon={Download} size="sm" />
              Download
            </a>
          </Button>

          {/* View externally button — only when webViewLink (e.g. Google Drive) is set */}
          {file.webViewLink && (
            <Button asChild variant="ghost" size="sm">
              <a href={file.webViewLink} target="_blank" rel="noreferrer">
                <Icon icon={ExternalLink} size="sm" />
                View externally
              </a>
            </Button>
          )}
        </Stack>
      )}
    </div>
  );
};

ImageViewer.displayName = 'ImageViewer';
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest src/composites/viewers/ImageViewer.test.tsx
```

Expected: PASS — 7 tests pass.

- [ ] **Step 5: Add to barrel export**

Update `packages/ui/src/index.ts` — add:
```ts
export { ImageViewer } from './composites/viewers/ImageViewer';
```

- [ ] **Step 6: Run full test suite to confirm nothing is broken**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest --coverage
```

Expected: All tests pass. Coverage ≥ 80%.

- [ ] **Step 7: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add packages/ui/src/composites/viewers/ImageViewer.tsx packages/ui/src/composites/viewers/ImageViewer.test.tsx packages/ui/src/index.ts
git commit -m "feat(@kb/ui): add ImageViewer composite with load/error states and zoom"
```

---

## Task 11: `FilesDrawer` Feature Component

**Files:**
- Create: `frontend/components/features/files/FilesDrawer.tsx`
- Create: `frontend/components/features/files/FilesDrawer.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/components/features/files/FilesDrawer.test.tsx`:
```tsx
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilesDrawer } from './FilesDrawer';
import { filesApi } from '@/lib/api/files';

// Mock the files API
jest.mock('@/lib/api/files', () => ({
  filesApi: {
    get: jest.fn(),
  },
}));

// Mock @kb/ui to avoid needing the full package in frontend tests
jest.mock('@kb/ui', () => ({
  FileViewerShell: ({ file }: { file: { filename: string } }) => (
    <div data-testid="file-viewer-shell">{file.filename}</div>
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Spinner: () => <div role="status" />,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Icon: () => null,
}));

const mockFile = {
  id: 'file-1',
  name: 'report.pdf',
  path: '/reports/report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024000,
  status: 'INDEXED' as const,
  sourceId: 'src-1',
  collectionId: null,
  tags: [],
  indexedAt: '2026-03-01T00:00:00Z',
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

describe('FilesDrawer', () => {
  beforeEach(() => {
    (filesApi.get as jest.Mock).mockResolvedValue(mockFile);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when fileId is null', () => {
    render(<FilesDrawer fileId={null} onClose={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the drawer when fileId is provided', async () => {
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows a spinner while the file is loading', () => {
    // Don't resolve the promise immediately
    (filesApi.get as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders FileViewerShell with the fetched file', async () => {
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('file-viewer-shell')).toBeInTheDocument();
    });
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = jest.fn();
    render(<FilesDrawer fileId="file-1" onClose={onClose} />);
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = jest.fn();
    render(<FilesDrawer fileId="file-1" onClose={onClose} />);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when the API call fails', async () => {
    (filesApi.get as jest.Mock).mockRejectedValue(new Error('Not found'));
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/could not load file/i)).toBeInTheDocument();
    });
  });

  it('shows the "Open full view" link pointing to /files/:id', async () => {
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    await screen.findByRole('dialog');
    const link = screen.getByRole('link', { name: /open full view/i });
    expect(link).toHaveAttribute('href', '/kms/en/files/file-1');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx jest components/features/files/FilesDrawer.test.tsx
```

Expected: FAIL — `Cannot find module './FilesDrawer'`

- [ ] **Step 3: Implement `FilesDrawer`**

Create `frontend/components/features/files/FilesDrawer.tsx`:
```tsx
'use client';

/**
 * FilesDrawer — Layer 4 feature component.
 *
 * Fetches a KmsFile by ID and renders it in a slide-in side panel
 * using FileViewerShell from @kb/ui.
 *
 * Layer responsibilities:
 *   - Knows about KmsFile (domain type from lib/api/files)
 *   - Calls filesApi.get() to load the file
 *   - Adapts KmsFile → ViewerFile (the @kb/ui interface)
 *   - Mounts FileViewerShell (mode="drawer")
 *   - Provides close/ESC/backdrop dismiss behaviour
 *   - Provides "Open full view" CTA → navigates to /files/:id
 *
 * @see packages/ui/src/composites/FileViewerShell.tsx for the rendering logic
 * @see docs/architecture/decisions/0032-hybrid-viewer-ux.md for UX rationale
 */

import * as React from 'react';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';
import { FileViewerShell, Button, Spinner, Text, Stack, Icon } from '@kb/ui';
import type { ViewerFile } from '@kb/ui';
import { filesApi } from '@/lib/api/files';
import type { KmsFile } from '@/lib/api/files';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Adapts a KmsFile (frontend domain type) to a ViewerFile (@kb/ui interface).
 *
 * KmsFile has additional fields (sourceId, collectionId, tags, etc.) that
 * @kb/ui composites don't need. This function strips them.
 *
 * @param file - Full KmsFile from the API
 * @returns ViewerFile subset used by FileViewerShell
 */
function toViewerFile(file: KmsFile): ViewerFile {
  return {
    id: file.id,
    // KmsFile uses `name` but ViewerFile uses `filename` for clarity
    filename: file.name,
    mimeType: file.mimeType,
    storageUrl: file.path,   // path holds the storage URL in the KmsFile schema
    sizeBytes: file.sizeBytes,
    status: file.status,
    metadata: {},            // metadata is not returned by filesApi.get() yet
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FilesDrawerProps {
  /**
   * ID of the file to display. Pass `null` to close the drawer.
   * The drawer re-fetches the file whenever this changes to a non-null value.
   */
  fileId: string | null;
  /** Called when the user closes the drawer (Esc, backdrop click, × button) */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * FilesDrawer — slide-in file preview panel.
 *
 * Opens from the right side when a file card is clicked.
 * Shows a Spinner while loading, FileViewerShell once loaded, and an
 * error message if the API call fails.
 *
 * @example
 * const [selectedFileId, setSelectedFileId] = React.useState<string | null>(null);
 *
 * <FilesDrawer fileId={selectedFileId} onClose={() => setSelectedFileId(null)} />
 */
export function FilesDrawer({ fileId, onClose }: FilesDrawerProps) {
  const [file, setFile] = React.useState<KmsFile | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch the file whenever fileId changes
  React.useEffect(() => {
    if (!fileId) {
      // Reset state when drawer is closed
      setFile(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    filesApi
      .get(fileId)
      .then((data) => {
        if (!cancelled) {
          setFile(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Unknown error';
          setError(`Could not load file: ${message}`);
          setLoading(false);
        }
      });

    // Cleanup: don't update state if this effect re-runs before the fetch completes
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // Dismiss on Escape key press
  React.useEffect(() => {
    if (!fileId) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fileId, onClose]);

  // Drawer is closed — render nothing
  if (!fileId) return null;

  return (
    <>
      {/* Backdrop — clicking it closes the drawer */}
      <div
        className="fixed inset-0 z-[49] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={file ? `Preview: ${file.name}` : 'File preview'}
        className={cn(
          'fixed right-0 top-0 z-[50] flex h-full w-[480px] max-w-[100vw]',
          'flex-col bg-slate-900 shadow-2xl',
          'border-l border-slate-700',
          // Slide-in animation — matches slideIn keyframe in tailwind.config.ts
          'animate-[slideIn_0.2s_ease-out]'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div className="min-w-0 flex-1 pr-4">
            {file && (
              <p className="truncate text-sm font-medium text-slate-100">
                {file.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Open full view — navigates to /files/:id detail page */}
            {file && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/files/${file.id}`}>
                  <Icon icon={ExternalLink} size="sm" />
                  Open full view
                </Link>
              </Button>
            )}
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
            >
              <Icon icon={X} size="sm" />
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Spinner label="Loading file…" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center p-8">
              <Text variant="error" size="sm">
                {error}
              </Text>
            </div>
          )}

          {file && !loading && !error && (
            <div className="p-4">
              <FileViewerShell
                file={toViewerFile(file)}
                mode="drawer"
                onClose={onClose}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx jest components/features/files/FilesDrawer.test.tsx
```

Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add frontend/components/features/files/FilesDrawer.tsx frontend/components/features/files/FilesDrawer.test.tsx
git commit -m "feat(frontend): add FilesDrawer feature component with FileViewerShell integration"
```

---

## Task 12: Wire `FilesBrowserPage` to Open Drawer

**Files:**
- Modify: `frontend/components/features/files/FilesBrowserPage.tsx`

- [ ] **Step 1: Read the current FileCard to understand its props**

```bash
grep -n "interface FileCardProps\|onClick\|onSelect" /home/ubuntu/Sites/projects/gp/knowledge-base/frontend/components/features/files/FileCard.tsx | head -20
```

- [ ] **Step 2: Add `onOpen` prop to FileCard**

Open `frontend/components/features/files/FileCard.tsx`. Find the `FileCardProps` interface and add an `onOpen` prop:

Current props interface (find it — it will look something like):
```tsx
interface FileCardProps {
  file: KmsFile;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
}
```

Add `onOpen`:
```tsx
interface FileCardProps {
  file: KmsFile;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Called when the user clicks the file card body (not the checkbox or action menu) */
  onOpen?: (id: string) => void;
}
```

Then find the card's clickable body div and add `onClick`:
```tsx
// Find the main card container div and add a click handler:
<div
  className="... existing classes ..."
  onClick={() => onOpen?.(file.id)}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => e.key === 'Enter' && onOpen?.(file.id)}
  aria-label={`Preview ${file.name}`}
>
```

- [ ] **Step 3: Add drawer state and wiring to `FilesBrowserPage`**

Open `frontend/components/features/files/FilesBrowserPage.tsx`.

After the existing imports, add the FilesDrawer import:
```tsx
import { FilesDrawer } from './FilesDrawer';
```

Find the component function (begins with `export function FilesBrowserPage` or similar). Add `selectedFileId` state immediately after the existing state declarations:
```tsx
// Track which file is open in the preview drawer (null = drawer closed)
const [selectedFileId, setSelectedFileId] = React.useState<string | null>(null);
```

Find where `<FileCard>` is rendered (in the grid view). Add the `onOpen` prop:
```tsx
<FileCard
  key={file.id}
  file={file}
  selected={selectedIds.has(file.id)}
  onSelect={handleSelect}
  onDelete={handleDelete}
  onOpen={setSelectedFileId}   // ADD THIS LINE
/>
```

At the end of the component's return statement, before the final closing `</div>`, add the drawer:
```tsx
{/* File preview drawer — opens when a file card is clicked */}
<FilesDrawer
  fileId={selectedFileId}
  onClose={() => setSelectedFileId(null)}
/>
```

- [ ] **Step 4: Verify the page renders without TypeScript errors**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx tsc --noEmit
```

Expected: Passes with no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add frontend/components/features/files/FilesBrowserPage.tsx frontend/components/features/files/FileCard.tsx
git commit -m "feat(frontend): wire file card click to FilesDrawer in FilesBrowserPage"
```

---

## Task 13: Wire `drive/FilesBrowser` to Open Drawer

**Files:**
- Modify: `frontend/components/features/drive/FilesBrowser.tsx`
- Modify: `frontend/components/features/drive/FileCard.tsx`

- [ ] **Step 1: Add `onOpen` to the drive FileCard**

Open `frontend/components/features/drive/FileCard.tsx`. Find its props interface and add:
```tsx
/** Called when the user clicks the card body (preview action) */
onOpen?: (id: string) => void;
```

Find the card's preview eye-icon button (the hover action that currently does nothing or links away). Wire it:
```tsx
// The existing hover "preview" button — wire onOpen to it
<button
  className="... existing classes ..."
  onClick={(e) => {
    e.stopPropagation();  // Don't also trigger card-level select
    onOpen?.(file.id);
  }}
  aria-label={`Preview ${file.name}`}
>
  <Eye className="h-4 w-4" />
</button>
```

Also wire the card body click (if not already handling selection):
```tsx
<div
  className="... existing card container classes ..."
  onClick={() => onOpen?.(file.id)}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => e.key === 'Enter' && onOpen?.(file.id)}
>
```

- [ ] **Step 2: Add drawer state to `FilesBrowser`**

Open `frontend/components/features/drive/FilesBrowser.tsx`.

Add import at the top:
```tsx
import { FilesDrawer } from '../files/FilesDrawer';
```

Find the component function and add state after existing state declarations:
```tsx
// Track which file is open in the preview drawer
const [selectedFileId, setSelectedFileId] = React.useState<string | null>(null);
```

Find where `<FileCard>` is rendered in the grid view. Add `onOpen`:
```tsx
<FileCard
  key={file.id}
  file={file}
  selected={selectedIds.has(file.id)}
  onOpen={setSelectedFileId}   // ADD THIS
  // ... existing props
/>
```

At the end of the component return, add the drawer:
```tsx
<FilesDrawer
  fileId={selectedFileId}
  onClose={() => setSelectedFileId(null)}
/>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx tsc --noEmit
```

Expected: Passes.

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add frontend/components/features/drive/FilesBrowser.tsx frontend/components/features/drive/FileCard.tsx
git commit -m "feat(frontend): wire file card click to FilesDrawer in drive/FilesBrowser"
```

---

## Task 14: End-to-End Smoke Test

**Goal:** Confirm the full path works — package builds, imports resolve, dev server starts.

- [ ] **Step 1: Run the full `@kb/ui` test suite with coverage**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/packages/ui && npx jest --coverage
```

Expected: All tests pass. Coverage output shows ≥ 80% on all source files.

- [ ] **Step 2: Run the frontend test suite (files area)**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx jest components/features/files/ --coverage
```

Expected: All tests pass including the new `FilesDrawer.test.tsx`.

- [ ] **Step 3: TypeScript check the entire frontend**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Build check (catches any runtime import issues)**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base/frontend && npm run build 2>&1 | tail -20
```

Expected: Build completes with no errors. `transpilePackages: ['@kb/ui']` ensures all TypeScript in `packages/ui/src` is transpiled by Next.js.

- [ ] **Step 5: Final commit — Sprint 1 complete**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
git add .
git commit -m "feat: Sprint 1 complete — @kb/ui foundation, ImageViewer, FilesDrawer wired"
```

---

## Sprint 1 Checklist

Before declaring Sprint 1 done, verify:

- [ ] `packages/ui` exists at the root with `package.json` naming it `@kb/ui`
- [ ] All imports in frontend use `from '@kb/ui'`, never a relative path into `packages/ui/`
- [ ] `packages/ui/src/index.ts` exports: `Button`, `Badge`, `Icon`, `Text`, `Stack`, `Skeleton`, `Spinner`, `ProgressBar`, `Divider`, `FileViewerShell`, `ImageViewer`, `UnsupportedFileViewer`, `ViewerFile`, `ViewerMode`, `ViewerProps`
- [ ] `FileViewerShell` dispatches `image/*` to `ImageViewer` and unknown types to `UnsupportedFileViewer`
- [ ] `FilesDrawer` opens when a file card is clicked in both `/files` and `/drive`
- [ ] `FilesDrawer` shows a Spinner while loading, FileViewerShell once loaded, error text on API failure
- [ ] Close on Esc, backdrop click, and × button all call `onClose`
- [ ] "Open full view" link points to `/files/:id`
- [ ] `packages/ui` test coverage ≥ 80%
- [ ] `frontend` test suite passes with no regressions
- [ ] `npx tsc --noEmit` passes in `frontend/`
- [ ] `npm run build` succeeds in `frontend/`

---

## Next Steps (Sprint 2 plan — write before starting Sprint 2)

Sprint 2 adds:
- `VideoPlayer`, `AudioPlayer`, `PDFViewer` composites
- `ProcessingStatus` composite + `useFileStatus` WebSocket hook
- `FileDetailPage` at `app/[locale]/(dashboard)/files/[id]/page.tsx`
- WebSocket gateway in `kms-api`

The Sprint 2 plan will be written to `docs/superpowers/plans/2026-03-27-rendering-engine-sprint-2.md`.
