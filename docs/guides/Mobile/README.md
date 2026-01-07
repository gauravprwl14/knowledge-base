# 📱 Mobile Documentation (React Native + Expo)

> **Starter kit documentation for building production-ready mobile applications.**

---

## 📁 Contents

| File | Description | Read When |
|------|-------------|-----------|
| [00_QUICK_START.md](./00_QUICK_START.md) | Get started in 5 minutes | First thing |
| [01_ARCHITECTURE_OVERVIEW.md](./01_ARCHITECTURE_OVERVIEW.md) | Project structure & patterns | Understanding the codebase |
| [02_COMPONENT_SYSTEM.md](./02_COMPONENT_SYSTEM.md) | Building UI components | Creating new components |
| [03_NAVIGATION_GUIDE.md](./03_NAVIGATION_GUIDE.md) | Expo Router patterns | Setting up navigation |
| [04_STYLING_GUIDE.md](./04_STYLING_GUIDE.md) | StyleSheet & theming | Styling your app |
| [05_STATE_MANAGEMENT.md](./05_STATE_MANAGEMENT.md) | TanStack Query, Zustand | Managing data & state |
| [06_TESTING_GUIDE.md](./06_TESTING_GUIDE.md) | Jest + RNTL | Writing tests |
| [07_ERROR_HANDLING.md](./07_ERROR_HANDLING.md) | Error boundaries & codes | Handling errors |
| [08_LOADING_STATES.md](./08_LOADING_STATES.md) | Skeletons & spinners | Loading UX |
| [09_SETUP_GUIDE.md](./09_SETUP_GUIDE.md) | Full project setup | Initial configuration |

---

## 🎯 Key Principles

1. **Adapter Pattern** - Wrap third-party UI libraries in `components/ui/`
2. **Feature-First** - Organize code by feature, not by type
3. **Type Safety** - TypeScript strict mode everywhere
4. **Accessibility** - Every interactive element has proper ARIA

---

## 🚀 Quick Start

```bash
# Create new Expo project
npx create-expo-app@latest my-app --template blank-typescript

# Install dependencies
cd my-app
npx expo install expo-router react-native-safe-area-context

# Start development
npx expo start
```

---

## 📚 Recommended Reading Order

**For new developers:**
1. Quick Start → Architecture → Component System

**For feature development:**
1. Navigation → State Management → Styling

**For debugging:**
1. Error Handling → Testing → Loading States

---

> 📖 **Parent Docs:** See [../ARCHITECTURE_GUIDE.md](../ARCHITECTURE_GUIDE.md) for web-specific patterns.

