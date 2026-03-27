# 🧱 Mobile Component System

> **Goal:** Build consistent, accessible, and maintainable UI components for React Native.

---

## 1. Component Categories

| Category          | Location                 | Purpose                    | Example                |
| ----------------- | ------------------------ | -------------------------- | ---------------------- |
| **UI Primitives** | `components/ui/`         | Reusable atoms (adapters)  | Button, Input, Card    |
| **Common**        | `components/common/`     | Shared composed components | ErrorBoundary, Header  |
| **Feature**       | `features/*/components/` | Feature-specific UI        | LoginForm, ProfileCard |

---

## 2. Creating a New UI Component

### File Structure

```text
src/components/ui/
├── Button/
│   ├── index.ts          # Re-exports
│   ├── Button.tsx        # Component logic
│   ├── Button.types.ts   # TypeScript interfaces
│   └── Button.test.tsx   # Unit tests
```

### Component Template

```tsx
/**
 * @file Button.tsx
 * @description A customizable button component with multiple variants.
 *
 * @example
 * <Button variant="primary" onPress={handleSubmit}>
 *   Submit
 * </Button>
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacityProps,
} from "react-native";
import { colors, spacing } from "@/constants";

/**
 * Button variant types
 */
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

/**
 * Button size types
 */
type ButtonSize = "sm" | "md" | "lg";

/**
 * Props interface for Button component
 */
interface ButtonProps extends Omit<TouchableOpacityProps, "style"> {
  /** Button visual variant */
  readonly variant?: ButtonVariant;
  /** Button size */
  readonly size?: ButtonSize;
  /** Loading state - shows spinner and disables button */
  readonly isLoading?: boolean;
  /** Button text content */
  readonly children: React.ReactNode;
}

/**
 * Button Component
 *
 * @description Renders a customizable button with loading states and variants.
 * @param props - Button configuration props
 * @returns Rendered button element
 */
export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        styles[size],
        isDisabled && styles.disabled,
      ]}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={[styles.text, styles[`${variant}Text`]]}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  // Variants
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.secondary,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  // Sizes
  sm: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  md: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  lg: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  // States
  disabled: {
    opacity: 0.5,
  },
  // Text styles
  text: {
    fontWeight: "600",
  },
  primaryText: {
    color: colors.white,
  },
  secondaryText: {
    color: colors.white,
  },
  outlineText: {
    color: colors.primary,
  },
  ghostText: {
    color: colors.primary,
  },
});
```

---

## 3. Component Design Principles

### ✅ Do's

| Principle          | Description                                          |
| ------------------ | ---------------------------------------------------- |
| **Type Safety**    | Always define TypeScript interfaces for props        |
| **Default Values** | Provide sensible defaults for optional props         |
| **Accessibility**  | Include `accessibilityRole` and `accessibilityState` |
| **Documentation**  | Add JSDoc comments with examples                     |
| **Composition**    | Build complex components from simple ones            |

### ❌ Don'ts

| Anti-Pattern     | Why                                     |
| ---------------- | --------------------------------------- |
| Inline styles    | Use StyleSheet.create() for performance |
| Hardcoded colors | Use design tokens from constants        |
| Prop drilling    | Use context or composition              |
| Giant components | Break into smaller, focused pieces      |

---

## 4. Accessibility Checklist

Every interactive component MUST have:

- [ ] `accessibilityRole` (e.g., 'button', 'link', 'checkbox')
- [ ] `accessibilityLabel` if no visible text
- [ ] `accessibilityState` for stateful components
- [ ] `accessibilityHint` for non-obvious actions

```tsx
// Example: Accessible Icon Button
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Close modal"
  accessibilityHint="Closes the current dialog"
  onPress={onClose}
>
  <CloseIcon />
</TouchableOpacity>
```

---

## 5. Performance Tips

1. **Memoization:** Use `React.memo()` for pure components
2. **Callbacks:** Wrap handlers in `useCallback()` to prevent re-renders
3. **Lists:** Use `FlatList` instead of `ScrollView` + `map()`
4. **Images:** Use `expo-image` or `react-native-fast-image`

```tsx
// Memoized component example
export const ProfileCard = React.memo(function ProfileCard({
  name,
  avatar,
}: ProfileCardProps) {
  return (
    <View>
      <Image source={{ uri: avatar }} />
      <Text>{name}</Text>
    </View>
  );
});
```

---

> 📚 **Next:** Learn navigation patterns → [NAVIGATION_GUIDE.md](./03_NAVIGATION_GUIDE.md)
