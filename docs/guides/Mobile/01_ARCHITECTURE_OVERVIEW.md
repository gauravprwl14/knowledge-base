# 🏗️ Mobile Architecture Overview

> **Goal:** Understand the core architectural principles for React Native + Expo apps.

---

## 1. Core Philosophy: The Adapter Pattern

We **decouple business logic from third-party UI libraries**—same principle as our web app.

### Why?

- UI libraries change frequently (gesture handlers, animation libraries)
- By wrapping them in our own components, switching libraries means changing ONE file
- Business logic stays clean and testable

### Example:

```text
❌ Bad:  Feature imports from 'react-native-elements' directly
✅ Good: Feature imports from '@/components/ui/button'
         button.tsx wraps 'react-native-elements' internally
```

---

## 2. Project Structure

```text
src/
├── app/                    # Expo Router - Screen definitions
│   ├── (tabs)/             # Tab-based navigation group
│   ├── (auth)/             # Auth flow screens (login, register)
│   ├── _layout.tsx         # Root layout with providers
│   └── index.tsx           # Entry screen
│
├── components/
│   ├── ui/                 # 🔒 ADAPTER LAYER - Primitive components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Card.tsx
│   └── common/             # Shared composed components
│       ├── ErrorBoundary.tsx
│       └── LoadingScreen.tsx
│
├── features/               # Feature modules (Domain Logic)
│   ├── auth/
│   │   ├── components/     # Feature-specific UI
│   │   ├── hooks/          # Feature-specific hooks
│   │   ├── services/       # API calls
│   │   └── types.ts        # TypeScript definitions
│   └── profile/
│
├── lib/                    # Shared utilities
│   ├── api.ts              # API client setup (axios)
│   ├── storage.ts          # AsyncStorage wrapper
│   └── utils.ts            # Helper functions
│
├── hooks/                  # Global custom hooks
│   ├── useAuth.ts
│   └── useNetwork.ts
│
└── constants/              # App-wide constants
    ├── colors.ts           # Design tokens
    ├── spacing.ts          # Layout spacing values
    └── typography.ts       # Font configurations
```

---

## 3. Key Architectural Rules

### Rule 1: Feature-First Organization

Group code by **feature**, not by type. This keeps related code together.

```text
❌ Bad:
├── components/
│   ├── LoginButton.tsx
│   └── ProfileCard.tsx
├── hooks/
│   ├── useLogin.ts
│   └── useProfile.ts

✅ Good:
├── features/
│   ├── auth/
│   │   ├── components/LoginButton.tsx
│   │   └── hooks/useLogin.ts
│   └── profile/
│       ├── components/ProfileCard.tsx
│       └── hooks/useProfile.ts
```

### Rule 2: The UI Folder is Sacred

- `src/components/ui/` contains ONLY primitive, reusable components
- These wrap third-party libraries (our "adapters")
- Feature code **never** imports directly from `node_modules` for UI

### Rule 3: Separation of Concerns

| Layer            | Responsibility                   |
| ---------------- | -------------------------------- |
| `app/`           | Routing, screen composition      |
| `components/ui/` | Visual primitives (Button, Card) |
| `features/`      | Business logic, feature UI       |
| `lib/`           | Shared utilities, API client     |
| `hooks/`         | Reusable stateful logic          |

---

## 4. Data Flow Pattern

```text
┌─────────────────┐
│   Screen/Page   │  ← Composes features
└────────┬────────┘
         │
┌────────▼────────┐
│ Feature Module  │  ← Contains business logic
│  (hooks/services)│
└────────┬────────┘
         │
┌────────▼────────┐
│   API Layer     │  ← Communicates with backend
│   (lib/api.ts)  │
└─────────────────┘
```

---

## 5. When to Create a New Feature Module

Create a new feature module when:

- [ ] The functionality is distinct (e.g., "payments", "notifications")
- [ ] It has its own API endpoints
- [ ] It could potentially be extracted as a separate package
- [ ] It has 3+ components or hooks

---

> 📚 **Next:** Learn how to build components → [COMPONENT_SYSTEM.md](./02_COMPONENT_SYSTEM.md)
