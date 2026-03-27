# 🏗️ Architecture Overview

This project follows a "Principal Technical Consultant" persona architecture—premium, scalable, and easy to maintain.

## 1. Core Pattern: The Adapter Pattern

We use the **Adapter Pattern** to decouple our business logic from third-party UI libraries.

### Why?
UI libraries (like Radix or Headless UI) change often. By wrapping them in our own components, we ensure that if we ever want to switch libraries, we only change one file in `src/components/ui` rather than 100 files across the codebase.

### Example:
- **External Library**: `@radix-ui/react-label`
- **Our Adapter**: `src/components/ui/label.tsx`
- **Feature Code**: Imports from `@/components/ui/label`, **NOT** from Radix directly.

## 2. Project Structure

```text
src/
├── app/            # Next.js App Router (Routing, Layouts, Pages)
├── components/     # High-level components
│   └── ui/         # [CRITICAL] Adapter-layer components (Button, Input, etc.)
├── features/       # Feature-based folders (Blog, Portfolio)
│   ├── components/ # Local components for this feature
│   ├── lib/        # Feature-specific logic
│   └── types/      # Feature-specific Type definitions
├── lib/            # Shared utility functions (e.g., utils.ts)
└── styles/         # Global styles (globals.css)
```

## 3. Server vs. Client Components

- **Server Components (Default)**: Use these for data fetching and static content. They reduce the amount of JavaScript sent to the browser.
- **Client Components (`'use client'`)**: Use these ONLY when you need interactivity (hooks like `useState`, `useEffect`, or event listeners).

> [!IMPORTANT]
> Keep Client Components at the "leaves" of your component tree. Wrap only the interactive parts, while keeping parents as Server Components where possible.

## 4. Design System

We use **Tailwind CSS 4** with semantic tokens.
- **❌ Bad**: `text-gray-500` (Hardcoded)
- **✅ Good**: `text-muted-foreground` (Theme-aware)

All design tokens (colors, spacing) are defined as CSS variables in `src/app/globals.css`.

---

> [!NOTE]
> For a deeper dive into UI patterns, see [COMPONENT_SYSTEM.md](./COMPONENT_SYSTEM.md).
