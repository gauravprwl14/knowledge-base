# 🛠️ Mobile Setup Guide

> **Goal:** Complete setup guide for React Native + Expo development environment.

---

## 1. Prerequisites

### Required Software
| Software | Version | Installation |
|----------|---------|--------------|
| **Node.js** | v18+ (LTS) | [nodejs.org](https://nodejs.org) or `nvm` |
| **npm** | v9+ | Comes with Node.js |
| **Git** | Latest | [git-scm.com](https://git-scm.com) |
| **Watchman** | Latest | macOS: `brew install watchman` |

### For iOS Development (macOS only)
| Software | Installation |
|----------|--------------|
| **Xcode** | App Store |
| **Xcode CLI** | `xcode-select --install` |
| **CocoaPods** | `sudo gem install cocoapods` |

### For Android Development
| Software | Installation |
|----------|--------------|
| **Android Studio** | [developer.android.com](https://developer.android.com/studio) |
| **JDK 17** | Via Android Studio or `brew install openjdk@17` |

---

## 2. Project Creation

### Create New Expo Project
```bash
# Create with TypeScript template
npx create-expo-app@latest my-app --template blank-typescript

# Navigate to project
cd my-app
```

### Install Core Dependencies
```bash
# Navigation
npx expo install expo-router react-native-screens react-native-safe-area-context

# UI essentials
npx expo install expo-status-bar expo-font expo-splash-screen

# State & data
npm install @tanstack/react-query zustand

# Forms
npm install react-hook-form @hookform/resolvers zod

# API
npm install axios

# Storage
npx expo install @react-native-async-storage/async-storage
```

---

## 3. Project Structure Setup

```bash
# Create folder structure
mkdir -p src/{app,components/{ui,common},features,lib,hooks,constants,providers}
```

### Move Entry Point
```json
// package.json
{
  "main": "expo-router/entry"
}
```

### Configure App Entry
```json
// app.json
{
  "expo": {
    "name": "My App",
    "slug": "my-app",
    "scheme": "myapp",
    "version": "1.0.0",
    "orientation": "portrait",
    "platforms": ["ios", "android", "web"],
    "web": {
      "bundler": "metro",
      "output": "static"
    }
  }
}
```

---

## 4. TypeScript Configuration

```json
// tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

---

## 5. ESLint & Prettier Setup

### Install Dependencies
```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks prettier eslint-config-prettier
```

### ESLint Config
```js
// .eslintrc.js
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  parserOptions: {
    ecmaFeatures: { jsx: true },
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

### Prettier Config
```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

## 6. Package Scripts

```json
// package.json
{
  "scripts": {
    "start": "expo start",
    "ios": "expo start --ios",
    "android": "expo start --android",
    "web": "expo start --web",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

---

## 7. Initial App Layout

```tsx
// src/app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
```

---

## 8. Testing Setup

### Install Testing Dependencies
```bash
npm install --save-dev jest @testing-library/react-native @testing-library/jest-native jest-expo
```

### Jest Configuration
```js
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
  ],
};
```

---

## 9. Environment Variables

### Create `.env` File
```bash
# .env
API_URL=https://api.example.com
```

### Type Definitions
```tsx
// src/types/env.d.ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_API_URL: string;
    }
  }
}

export {};
```

### Access in Code
```tsx
const API_URL = process.env.EXPO_PUBLIC_API_URL;
```

---

## 10. Running the App

### Development
```bash
# Start Expo development server
npm start

# Run on iOS Simulator
npm run ios

# Run on Android Emulator
npm run android

# Run in browser
npm run web
```

### Building for Production
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

---

## 11. Troubleshooting

| Issue | Solution |
|-------|----------|
| Metro bundler stuck | `npx expo start -c` (clear cache) |
| iOS build fails | `cd ios && pod install && cd ..` |
| Android build fails | Sync Gradle in Android Studio |
| TypeScript errors | `npm run typecheck` |
| Module not found | Delete `node_modules`, reinstall |

### Clean Rebuild
```bash
# Full clean
rm -rf node_modules
rm -rf .expo
rm -rf ios/Pods
rm -rf android/.gradle
npm install
cd ios && pod install && cd ..
npm start -c
```

---

## 12. Recommended VS Code Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "msjsdiag.vscode-react-native",
    "dsznajder.es7-react-js-snippets"
  ]
}
```

---

> ✅ **You're Ready!** Start building features in `src/features/`

