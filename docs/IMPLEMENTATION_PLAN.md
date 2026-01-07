# Knowledge Management System - Implementation Plan

## Architecture: Frontend-First with Mock Data (Revised)

**Version:** 2.0
**Date:** 2026-01-07
**Approach:** Build complete UI with mock data first, connect backend later
**Duration:** 9 weeks (phased implementation)

---

## Design Principles

### 1. Mobile-First Responsive Design

**Breakpoints Strategy:**
```typescript
xs:   320px - 639px   // Mobile phones (portrait)
sm:   640px - 767px   // Mobile phones (landscape)
md:   768px - 1023px  // Tablets
lg:   1024px - 1279px // Small laptops
xl:   1280px - 1535px // Desktop
2xl:  1536px - 1919px // Large desktop
3xl:  1920px+         // Ultra-wide monitors
```

**Layout Adaptations:**
- **xs-sm (Mobile)**: Bottom navigation, hamburger menu, single column, 100% width cards
- **md (Tablet)**: Collapsible sidebar, 2-column grids, 48px tap targets
- **lg-xl (Desktop)**: Full sidebar, 3-column grids, 24px margins
- **2xl-3xl (Ultra-wide)**: Max content width (1440px), centered with side margins

### 2. Adapter Pattern (ARCHITECTURE_GUIDE.md)

**Rule:** External libs live ONLY in `components/ui/`, never import from `node_modules` directly

```
✅ CORRECT:
features/knowledge/components/KnowledgeCard.tsx
  → import { Button } from '@/components/ui/button'

❌ WRONG:
features/knowledge/components/KnowledgeCard.tsx
  → import { Button } from '@radix-ui/react-button'
```

**Why:** If we switch from Radix to AriaKit, only change files in `ui/`, not 100 feature files

### 3. Error Handling System (ERROR_GUIDE.md)

**Error Code Format:** `PREFIX + 4-digit code`

```typescript
// Error Prefixes
GEN - General errors
VAL - Validation errors
DAB - Database errors
API - API errors
UNK - Unknown errors
KB  - Knowledge Base errors
DRV - Google Drive errors
OBS - Obsidian errors
```

**Error Structure:**
```typescript
interface ErrorDefinition {
  code: string              // "KB1001"
  message: string           // User-friendly message
  messageKey: string        // i18n key: "error.kb.KB1001.not_found"
  errorType: ErrorType      // VALIDATION, SYSTEM, etc.
  errorCategory: ErrorCategory // CLIENT, SERVER, etc.
  statusCode: number        // HTTP status code
}
```

**Factory Pattern:**
```typescript
// lib/errors/knowledge-base-error-factory.ts
export class KnowledgeBaseErrorFactory extends BaseAbstractErrorFactory {
  static notFound() {
    return this.createError({
      code: 'KB1001',
      message: 'Knowledge base entry not found',
      messageKey: 'error.kb.KB1001.not_found',
      errorType: 'VALIDATION',
      errorCategory: 'CLIENT',
      statusCode: 404
    });
  }
}
```

### 4. Server vs Client Components Strategy

**Default: Server Components (RSC)**

```typescript
// ✅ Server Component (default)
// app/(dashboard)/knowledge/page.tsx
export default async function KnowledgePage() {
  // Fetch data server-side
  const entries = await apiClient.knowledge.list({ page: 1 });

  return <KnowledgeList initialData={entries} />; // Pass to client
}

// ✅ Client Component (interactive)
// features/knowledge/components/KnowledgeList.tsx
'use client'
export function KnowledgeList({ initialData }) {
  const [filter, setFilter] = useState('');
  // Client-side interactivity
}
```

**When to use Client Components:**
- `onClick`, `onChange`, `useEffect`
- Browser APIs (`window`, `localStorage`)
- `useState`, `useReducer`, Context
- Animations (Framer Motion)

### 5. Form Handling (React Hook Form + Zod)

**Pattern: Lego Form System**

```typescript
// Define schema
const knowledgeSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(10),
  tags: z.array(z.string()).max(10),
});

// Use Form component
<Form schema={knowledgeSchema} onSubmit={handleSubmit}>
  <FormInput name="title" label={t('knowledge.title')} />
  <FormTextarea name="content" label={t('knowledge.content')} />
  <FormTagInput name="tags" label={t('knowledge.tags')} />
  <FormSubmitButton>{t('common.save')}</FormSubmitButton>
</Form>
```

### 6. Internationalization (i18n)

**Rule: ZERO hardcoded strings**

```typescript
// ❌ Bad
<h1>Welcome to Knowledge Base</h1>

// ✅ Good
import { useTranslations } from 'next-intl';

const t = useTranslations('Knowledge');
<h1>{t('welcome')}</h1>

// messages/en.json
{
  "Knowledge": {
    "welcome": "Welcome to Knowledge Base",
    "createNew": "Create New Entry"
  }
}
```

**Setup:**
- Use `next-intl` library
- Default language: English (`en`)
- Language switcher in header/user menu
- No language in URLs (use headers)

### 7. Design System: Framer.com Inspiration

**Design Inspiration:** https://www.framer.com
**Color Palette:** Ray.so "Almost Cyan" theme (teal/cyan accents)

**Framer.com Design Principles:**
- **Bold Typography:** Large headings with strong visual hierarchy
- **Smooth Animations:** 60fps transitions with spring physics
- **Micro-interactions:** Hover states, button presses, card lifts
- **Generous Whitespace:** Breathing room between elements
- **Modern Sans-serif:** Clean, readable fonts (Inter var)
- **Sophisticated Gradients:** Subtle, non-blue/purple gradients
- **Glass Morphism:** Frosted glass effects with blur
- **Dark Mode First:** Premium dark interface as default
- **Fluid Layouts:** Responsive with smooth breakpoint transitions
- **Motion Design:** Stagger animations, parallax effects

**Color Palette (Almost Cyan):**
```typescript
colors: {
  // Primary (Cyan/Teal) - From Ray.so Almost Cyan
  primary: {
    50: '#ecfeff',
    400: '#22d3ee',  // Main accent
    500: '#06b6d4',
    600: '#0891b2',
  },
  // Dark mode (Framer-inspired deep blacks)
  dark: {
    bg: '#0a0a0a',
    surface: '#141414',
    surfaceHover: '#1a1a1a',
    border: '#2a2a2a',
  },
  // Text (high contrast for readability)
  text: {
    primary: '#ffffff',
    secondary: '#a1a1aa',
    muted: '#71717a',
  }
}
```

**Glass Morphism (Moderate level):**
```css
.glass-light {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.glass-medium {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

**Animation Tokens (Framer-style):**
```typescript
// Spring animations (Framer Motion)
const spring = {
  type: "spring",
  stiffness: 300,
  damping: 30
};

// Durations
const duration = {
  fast: 150,      // Micro-interactions
  normal: 250,    // Standard transitions
  slow: 400,      // Page transitions
};

// Easings (Framer-style curves)
const easing = {
  smooth: [0.45, 0, 0.55, 1],      // ease-in-out-quad
  snappy: [0.34, 1.56, 0.64, 1],   // back-out
};
```

**Typography Scale (Framer-inspired bold hierarchy):**
```css
/* Headings - Bold and impactful */
h1: 3.5rem/1.2 (56px)  font-weight: 700
h2: 2.5rem/1.3 (40px)  font-weight: 700
h3: 1.875rem/1.4 (30px) font-weight: 600
h4: 1.5rem/1.5 (24px)   font-weight: 600

/* Body - Readable and clear */
body-lg: 1.125rem/1.6 (18px) font-weight: 400
body:    1rem/1.6 (16px)     font-weight: 400
body-sm: 0.875rem/1.5 (14px) font-weight: 400
```

---

## File Structure

```
frontend/
├── app/
│   ├── [locale]/                  # i18n wrapper
│   │   ├── (dashboard)/           # Route group with layout
│   │   │   ├── layout.tsx        # Sidebar + header layout
│   │   │   ├── dashboard/        # Dashboard home
│   │   │   ├── knowledge/        # Knowledge base feature
│   │   │   ├── drive/            # Google Drive
│   │   │   ├── search/           # Global search
│   │   │   ├── obsidian/         # Obsidian integration
│   │   │   ├── transcribe/       # Voice transcription
│   │   │   ├── bookmarks/        # URL bookmarks
│   │   │   └── prompts/          # Prompts library
│   │   └── layout.tsx            # Root layout (providers)
│   └── api/                       # API routes (kept for proxy)
│
├── components/
│   ├── ui/                        # Adapter layer (Shadcn UI)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── form.tsx              # Form wrapper with RHF
│   │   ├── form-input.tsx
│   │   ├── form-textarea.tsx
│   │   ├── form-select.tsx
│   │   ├── form-tag-input.tsx
│   │   └── ... (15 more components)
│   ├── layout/
│   │   ├── MobileNav.tsx         # Bottom nav for mobile
│   │   ├── Sidebar.tsx           # Desktop sidebar
│   │   ├── Header.tsx            # Global header
│   │   ├── MobileMenu.tsx        # Hamburger menu
│   │   └── AppShell.tsx          # Responsive wrapper
│   ├── loading/
│   │   ├── SkeletonCard.tsx
│   │   ├── SkeletonList.tsx
│   │   ├── SkeletonTable.tsx
│   │   └── PageLoader.tsx
│   └── shared/
│       ├── ErrorBoundary.tsx     # Error boundary with codes
│       ├── LanguageSwitcher.tsx
│       └── ThemeToggle.tsx
│
├── features/                      # Feature modules
│   ├── knowledge/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   │   ├── knowledge.api.ts   # API interface
│   │   │   └── knowledge.mock.ts  # Mock implementation
│   │   ├── types/
│   │   ├── schemas/               # Zod schemas
│   │   └── errors/                # Feature-specific errors
│   └── ... (6 more features)
│
├── lib/
│   ├── api/
│   │   ├── client.ts              # Base API client
│   │   ├── mock-adapter.ts        # Mock API provider
│   │   ├── real-adapter.ts        # Real API provider
│   │   └── types.ts
│   ├── errors/
│   │   ├── base-error.ts
│   │   ├── error-factory.ts
│   │   ├── error-codes.ts
│   │   └── ... (error system)
│   ├── i18n/
│   │   ├── config.ts
│   │   └── middleware.ts
│   └── utils/
│       ├── cn.ts                  # Class name merger
│       └── validation.ts
│
├── mocks/
│   ├── factories/                 # Mock data generators
│   │   ├── knowledge.factory.ts
│   │   └── ... (7 more)
│   └── fixtures/                  # Static test data
│
├── messages/                      # i18n translations
│   ├── en.json
│   ├── es.json (future)
│   └── fr.json (future)
│
└── middleware.ts                  # next-intl middleware
```

---

## Phase 1: Foundation (Week 1)

### Goals
- Set up design system with Framer.com-inspired aesthetics and Almost Cyan colors
- Configure mobile-first responsive breakpoints
- Implement adapter pattern for UI components
- Set up error handling system
- Configure i18n with next-intl
- Install all dependencies

### Tasks

#### 1.1 Design System Setup

**Create theme configuration:**
```bash
mkdir -p frontend/lib/design-system
touch frontend/lib/design-system/theme.ts
touch frontend/lib/design-system/breakpoints.ts
touch frontend/lib/design-system/animations.ts
```

**Update Tailwind config:**
```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';
import { theme } from './lib/design-system/theme';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
  ],
  theme: {
    screens: {
      xs: '320px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
    extend: {
      colors: theme.colors,
      // ... rest of theme
    },
  },
};
```

#### 1.2 Install Dependencies

```bash
cd frontend

# Core dependencies
npm install next@latest react@latest react-dom@latest
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install next-intl  # i18n
npm install react-hook-form @hookform/resolvers zod
npm install framer-motion  # Animations

# UI dependencies
npm install @radix-ui/react-dialog
npm install @radix-ui/react-dropdown-menu
npm install @radix-ui/react-popover
npm install @radix-ui/react-tabs
npm install @radix-ui/react-tooltip
npm install @radix-ui/react-accordion
npm install @radix-ui/react-scroll-area
npm install @radix-ui/react-select
npm install @radix-ui/react-toast
npm install cmdk  # Command palette
npm install lucide-react  # Icons

# Utils
npm install class-variance-authority clsx tailwind-merge
npm install tailwindcss-animate

# Mock data
npm install -D @faker-js/faker
npm install -D @types/node
```

#### 1.3 Shadcn UI Setup (Adapter Pattern)

```bash
npx shadcn-ui@latest init

# Install base components (adapter layer)
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add scroll-area
npx shadcn-ui@latest add command
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add form
```

#### 1.4 Error Handling System

**Create error infrastructure:**
```bash
mkdir -p frontend/lib/errors
touch frontend/lib/errors/base-error.ts
touch frontend/lib/errors/error-factory.ts
touch frontend/lib/errors/error-codes.ts
touch frontend/lib/errors/error-types.ts
touch frontend/lib/errors/error-categories.ts
```

**Implement BaseError class** (following ERROR_GUIDE.md pattern)

#### 1.5 i18n Configuration

```bash
mkdir -p frontend/messages
touch frontend/messages/en.json
touch frontend/lib/i18n/config.ts
touch frontend/middleware.ts
```

**Configure next-intl:**
```typescript
// lib/i18n/config.ts
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`../../messages/${locale}.json`)).default
}));
```

### Deliverables (Week 1)
- ✅ Complete design system with Framer.com aesthetics and Almost Cyan colors
- ✅ Tailwind config with mobile-first breakpoints
- ✅ All Shadcn UI components installed in `components/ui/`
- ✅ Error handling system implemented
- ✅ i18n configured with English translations
- ✅ All dependencies installed

---

## Phase 2: Mobile-First Responsive Layout (Week 1-2)

### Goals
- Build responsive navigation (mobile bottom nav, desktop sidebar)
- Create app shell with breakpoint-aware layout
- Implement hamburger menu for mobile
- Add touch gesture support

### Tasks

#### 2.1 Mobile Navigation (Bottom Nav)

**Create component:**
```tsx
// components/layout/MobileNav.tsx
'use client'

import { Home, Search, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { icon: Home, label: 'Home', href: '/dashboard' },
  { icon: Search, label: 'Search', href: '/search' },
  { icon: Plus, label: 'Add', href: '/knowledge/new' },
  { icon: User, label: 'Profile', href: '/settings' },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-dark-surface border-t border-dark-border md:hidden z-50">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full",
                "min-w-[44px]", // Touch target size
                isActive ? "text-primary-400" : "text-text-secondary"
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

**Features:**
- Only visible on mobile (`md:hidden`)
- 44px minimum touch targets (accessibility)
- Active state highlighting
- Fixed bottom positioning

#### 2.2 Desktop Sidebar

**Create component with mobile hamburger:**
```tsx
// components/layout/Sidebar.tsx
'use client'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 bg-dark-surface rounded-lg"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Sidebar */}
      <aside className={cn(
        // Mobile: slide-over overlay
        "fixed top-0 left-0 h-screen bg-dark-surface z-40",
        "md:translate-x-0", // Desktop: always visible
        mobileOpen ? "translate-x-0" : "-translate-x-full", // Mobile: slide in/out
        collapsed ? "w-16" : "w-64",
        "transition-all duration-300"
      )}>
        {/* Sidebar content */}
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
        />
      )}
    </>
  );
}
```

#### 2.3 Responsive App Shell

```tsx
// components/layout/AppShell.tsx
'use client'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Desktop sidebar */}
      <Sidebar className="hidden md:block" />

      {/* Header */}
      <Header className="hidden md:block" />

      {/* Main content */}
      <main className={cn(
        "min-h-screen",
        // Mobile: full width, bottom padding for nav
        "pb-16 md:pb-0",
        // Desktop: offset for sidebar + header
        "md:ml-64 md:pt-16"
      )}>
        <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav className="md:hidden" />
    </div>
  );
}
```

#### 2.4 Touch Gestures

**Install library:**
```bash
npm install react-use-gesture
```

**Add swipe to dismiss:**
```tsx
// components/layout/MobileMenu.tsx
import { useGesture } from 'react-use-gesture';

const bind = useGesture({
  onDrag: ({ movement: [mx], cancel }) => {
    if (mx < -50) {
      cancel();
      onClose();
    }
  }
});

return <div {...bind()} />;
```

### Deliverables (Week 2)
- ✅ Mobile bottom navigation
- ✅ Desktop sidebar (collapsible)
- ✅ Hamburger menu with slide-over
- ✅ Responsive app shell
- ✅ Touch gestures (swipe to dismiss)
- ✅ All components responsive across breakpoints

---

## Phase 3-8: Feature Implementation (Weeks 3-8)

Each feature follows this pattern:

1. **Create types and schemas** (Zod validation)
2. **Create mock factory** (Faker.js generators)
3. **Create mock API** (implements API interface)
4. **Build mobile-first components** (responsive at all breakpoints)
5. **Create hooks** (TanStack Query)
6. **Build pages** (Server Component → Client Components)
7. **Add error handling** (error codes, boundaries)
8. **Add i18n** (zero hardcoded strings)
9. **Test responsive design** (xs through 3xl)

### Feature Priority Order

**Week 3: Knowledge Base** (Priority 1)
**Week 4: Google Drive** (Priority 2)
**Week 5: Enhanced Search** (Priority 3)
**Week 6: Obsidian Indexing** (Priority 4)
**Week 7: Voice Transcription Redesign** (Priority 5)
**Week 8: Bookmarks + Prompts** (Priority 6)

---

## Phase 9: Polish & Testing (Week 9)

### Tasks

#### 9.1 Accessibility Audit
- Keyboard navigation all features
- Screen reader testing
- ARIA labels verified
- Color contrast (WCAG AA)
- Focus management

#### 9.2 Responsive Testing
- Test on real devices (xs through 3xl)
- Test touch interactions
- Test gestures (swipe, pinch)
- Test orientation changes

#### 9.3 Performance Optimization
- Code splitting
- Image optimization
- Lazy loading
- Bundle size analysis

#### 9.4 Error Handling Verification
- Test all error codes
- Test error boundaries
- Test network failures
- Test validation errors

#### 9.5 i18n Completion
- Verify zero hardcoded strings
- Test language switching
- Verify all translations

#### 9.6 Documentation
- Update README
- Create component documentation
- Document mock-to-real migration
- Create deployment guide

### Deliverables (Week 9)
- ✅ Full accessibility compliance
- ✅ Tested across all breakpoints
- ✅ Performance optimized
- ✅ Error handling complete
- ✅ i18n complete
- ✅ Documentation complete
- ✅ Ready for backend integration

---

## Migration: Mock to Real API

### Step 1: Environment Variable

```bash
# .env.local
NEXT_PUBLIC_USE_MOCK_API=false  # Switch to real API
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_KEY=your_api_key
```

### Step 2: Implement Real Adapter

```typescript
// lib/api/real-adapter.ts
export const realAdapter = {
  knowledge: {
    list: async (params) => {
      const response = await fetch(`${API_URL}/api/v1/knowledge`, {
        headers: { 'X-API-Key': apiKey },
      });
      return response.json();
    },
    // ... other methods
  },
  // ... other features
};
```

### Step 3: No Component Changes Required

Components use abstracted `apiClient`, so no changes needed:

```typescript
// Works with both mock and real
const { data } = useKnowledgeList({ page: 1 });
```

---

## Success Criteria

### Week 1-2 (Foundation + Layout)
- [ ] Design system implemented
- [ ] All dependencies installed
- [ ] Error handling system working
- [ ] i18n configured
- [ ] Responsive layout (mobile + desktop)
- [ ] Can navigate between routes on all devices

### Week 3-8 (Features)
- [ ] All 7 features implemented with mock data
- [ ] All features responsive (xs through 3xl)
- [ ] All features use error codes
- [ ] All features internationalized
- [ ] All features follow adapter pattern

### Week 9 (Polish)
- [ ] Accessibility audit passed
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Ready for backend integration

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mock data doesn't match real API | High | Define TypeScript interfaces early, share with backend |
| Responsive design breaks on real devices | Medium | Test on physical devices weekly |
| Error handling inconsistent | Medium | Use error factory pattern everywhere |
| i18n incomplete | Low | Automated linting for hardcoded strings |
| Component coupling to Radix | High | Strict adapter pattern enforcement |

---

## Notes

- This plan assumes frontend-only development
- Backend integration is separate phase (not in this plan)
- All features built with mock data first
- Real API integration via environment variable switch
- Mobile-first approach throughout
- All guidelines from docs/guides/ followed
