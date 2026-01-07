# ⚡ Mobile Quick Start Checklist

> **Goal:** Get your React Native + Expo app running in under 5 minutes.

---

## 🛑 Before You Code

- [ ] **Install Expo CLI:** `npm install -g expo-cli`
- [ ] **Create Project:** `npx create-expo-app@latest my-app --template`
- [ ] **Choose Template:** Use `blank-typescript` for type safety

---

## 📱 Running Your App

```bash
# Start development server
npx expo start

# Run on specific platform
npx expo start --ios      # iOS Simulator
npx expo start --android  # Android Emulator
npx expo start --web      # Web Browser
```

---

## 🏗️ Project Structure at a Glance

```text
src/
├── app/              # Expo Router (file-based routing)
├── components/
│   └── ui/           # Reusable UI primitives (Button, Input)
├── features/         # Feature modules (auth, profile)
├── lib/              # Utilities and helpers
├── hooks/            # Custom React hooks
└── constants/        # App-wide constants (colors, spacing)
```

---

## ✅ Essential First Steps

1. **Configure TypeScript:** Ensure `tsconfig.json` has strict mode enabled
2. **Set Up Linting:** Add ESLint + Prettier for consistent code style
3. **Install Core Dependencies:**
   ```bash
   npx expo install react-native-safe-area-context
   npx expo install react-native-screens
   npx expo install expo-router
   ```

---

## 🎯 Next Steps

| Task                    | Guide                                                     |
| ----------------------- | --------------------------------------------------------- |
| Understand architecture | [ARCHITECTURE_OVERVIEW.md](./01_ARCHITECTURE_OVERVIEW.md) |
| Build components        | [COMPONENT_SYSTEM.md](./02_COMPONENT_SYSTEM.md)           |
| Set up navigation       | [NAVIGATION_GUIDE.md](./03_NAVIGATION_GUIDE.md)           |
| Style your app          | [STYLING_GUIDE.md](./04_STYLING_GUIDE.md)                 |

---

> 💡 **Tip:** Always run `npx expo install` instead of `npm install` for React Native packages. Expo ensures version compatibility automatically.
