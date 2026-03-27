# 🎨 Mobile Styling Guide

> **Goal:** Create consistent, performant, and maintainable styles in React Native.

---

## 1. Styling Approaches

| Approach | Pros | Cons | When to Use |
|----------|------|------|-------------|
| **StyleSheet** | Native, performant | Verbose | Default choice |
| **NativeWind** | Tailwind syntax, familiar | Build setup | Teams from web |
| **Styled Components** | Dynamic theming | Bundle size | Complex theming |

**Recommendation:** Use `StyleSheet.create()` as the base, consider NativeWind for teams familiar with Tailwind.

---

## 2. Design Tokens (Constants)

### Colors
```tsx
// constants/colors.ts
/**
 * @description Application color palette
 * Follows semantic naming for easy theming
 */
export const colors = {
  // Primary brand colors
  primary: '#007AFF',
  primaryDark: '#0056B3',
  primaryLight: '#4DA3FF',

  // Secondary colors
  secondary: '#5856D6',
  accent: '#FF9500',

  // Semantic colors
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#5AC8FA',

  // Neutral palette
  white: '#FFFFFF',
  black: '#000000',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Background colors
  background: '#FFFFFF',
  backgroundSecondary: '#F3F4F6',
  
  // Text colors
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  
  // Border colors
  border: '#E5E7EB',
  borderFocused: '#007AFF',
} as const;
```

### Spacing
```tsx
// constants/spacing.ts
/**
 * @description Consistent spacing scale (base: 4px)
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
```

### Typography
```tsx
// constants/typography.ts
import { Platform } from 'react-native';

/**
 * @description Font family and size definitions
 */
export const typography = {
  fontFamily: {
    regular: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
    medium: Platform.select({
      ios: 'System',
      android: 'Roboto-Medium',
    }),
    bold: Platform.select({
      ios: 'System',
      android: 'Roboto-Bold',
    }),
  },
  
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;
```

---

## 3. StyleSheet Patterns

### Basic Component Styles
```tsx
import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/constants';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
  },
});
```

### Conditional Styles
```tsx
// Use array syntax for conditional styles
<View style={[
  styles.button,
  variant === 'primary' && styles.primaryButton,
  disabled && styles.disabled,
]} />
```

### Dynamic Styles (with useMemo)
```tsx
import { useMemo } from 'react';

function Avatar({ size }: { size: number }) {
  const dynamicStyles = useMemo(() => ({
    width: size,
    height: size,
    borderRadius: size / 2,
  }), [size]);

  return <View style={[styles.avatar, dynamicStyles]} />;
}
```

---

## 4. Theming System

### Theme Context
```tsx
// providers/ThemeProvider.tsx
import React, { createContext, useContext, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  colors: typeof lightColors;
}

const lightColors = {
  background: '#FFFFFF',
  text: '#111827',
  primary: '#007AFF',
  // ... more colors
};

const darkColors = {
  background: '#111827',
  text: '#F9FAFB',
  primary: '#0A84FF',
  // ... more colors
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  
  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const colors = theme === 'light' ? lightColors : darkColors;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
```

### Using Theme in Components
```tsx
function MyComponent() {
  const { colors } = useTheme();
  
  return (
    <View style={{ backgroundColor: colors.background }}>
      <Text style={{ color: colors.text }}>Hello</Text>
    </View>
  );
}
```

---

## 5. NativeWind Setup (Optional)

If your team prefers Tailwind-style classes:

### Installation
```bash
npx expo install nativewind tailwindcss
```

### Configuration
```js
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#007AFF',
        secondary: '#5856D6',
      },
    },
  },
  plugins: [],
};
```

### Usage
```tsx
import { View, Text } from 'react-native';

export function Card() {
  return (
    <View className="bg-white p-4 rounded-lg shadow-md">
      <Text className="text-lg font-semibold text-gray-900">
        Card Title
      </Text>
    </View>
  );
}
```

---

## 6. Responsive Design

### Screen Dimensions
```tsx
import { Dimensions, useWindowDimensions } from 'react-native';

// Static (doesn't update on rotation)
const { width, height } = Dimensions.get('window');

// Reactive (updates on rotation)
function ResponsiveComponent() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  
  return (
    <View style={{ flexDirection: isLandscape ? 'row' : 'column' }}>
      {/* ... */}
    </View>
  );
}
```

### Responsive Utilities
```tsx
// lib/responsive.ts
import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions (design mockup size)
const baseWidth = 375;
const baseHeight = 812;

/**
 * Scale value based on screen width
 */
export function scaleWidth(size: number): number {
  return (SCREEN_WIDTH / baseWidth) * size;
}

/**
 * Scale value based on screen height
 */
export function scaleHeight(size: number): number {
  return (SCREEN_HEIGHT / baseHeight) * size;
}

/**
 * Moderate scale (for fonts - less aggressive)
 */
export function moderateScale(size: number, factor = 0.5): number {
  return size + (scaleWidth(size) - size) * factor;
}
```

---

## 7. Common Patterns

### Safe Area Handling
```tsx
import { SafeAreaView } from 'react-native-safe-area-context';

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {children}
    </SafeAreaView>
  );
}
```

### Shadows (Cross-Platform)
```tsx
const styles = StyleSheet.create({
  shadow: {
    // iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    // Android
    elevation: 3,
  },
});
```

---

## 8. Style Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Inline styles everywhere | Use `StyleSheet.create()` |
| Hardcoded colors (`#333`) | Use design tokens |
| Magic numbers (`padding: 17`) | Use spacing scale |
| Duplicate styles | Create shared styles/components |

---

> 📚 **Next:** Learn state management → [STATE_MANAGEMENT.md](./05_STATE_MANAGEMENT.md)

