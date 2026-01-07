# 🧭 Mobile Navigation Guide

> **Goal:** Implement robust, type-safe navigation using Expo Router.

---

## 1. Why Expo Router?

Expo Router provides **file-based routing** (like Next.js) for React Native.

| Feature | Benefit |
|---------|---------|
| File-based routing | Intuitive, matches web patterns |
| Deep linking | URLs work out of the box |
| Type safety | Full TypeScript support |
| Universal | Works on iOS, Android, and Web |

---

## 2. Routing Structure

```text
app/
├── _layout.tsx           # Root layout (providers, global UI)
├── index.tsx             # Home screen (matches "/")
├── (tabs)/               # Tab group
│   ├── _layout.tsx       # Tab navigator configuration
│   ├── index.tsx         # First tab (Home)
│   ├── explore.tsx       # Explore tab
│   └── profile.tsx       # Profile tab
├── (auth)/               # Auth flow group (not in tabs)
│   ├── _layout.tsx       # Auth stack layout
│   ├── login.tsx         # Login screen
│   └── register.tsx      # Register screen
├── settings/
│   ├── index.tsx         # Settings main screen
│   └── [category].tsx    # Dynamic route: /settings/privacy
└── [id].tsx              # Dynamic route at root: /123
```

---

## 3. Route Types

### Static Routes
```tsx
// app/about.tsx → matches "/about"
export default function AboutScreen() {
  return <Text>About Us</Text>;
}
```

### Dynamic Routes
```tsx
// app/product/[id].tsx → matches "/product/123"
import { useLocalSearchParams } from 'expo-router';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>Product: {id}</Text>;
}
```

### Groups (Organizing without affecting URL)
```tsx
// app/(auth)/login.tsx → matches "/login" (not "/auth/login")
// The (auth) folder groups screens but doesn't appear in URL
```

---

## 4. Layouts

### Root Layout (Required)
```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';
import { ThemeProvider } from '@/providers/ThemeProvider';

/**
 * Root Layout
 * @description Wraps entire app with providers and defines navigation structure
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
```

### Tab Layout
```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { HomeIcon, UserIcon, SearchIcon } from '@/components/icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <SearchIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <UserIcon color={color} />,
        }}
      />
    </Tabs>
  );
}
```

---

## 5. Navigation Actions

### Programmatic Navigation
```tsx
import { router } from 'expo-router';

// Navigate to a screen
router.push('/product/123');

// Replace current screen (no back)
router.replace('/home');

// Go back
router.back();

// Navigate with params
router.push({
  pathname: '/product/[id]',
  params: { id: '123' },
});
```

### Link Component
```tsx
import { Link } from 'expo-router';

<Link href="/settings">
  <Text>Go to Settings</Text>
</Link>

// With params
<Link href={{ pathname: '/user/[id]', params: { id: '42' }}}>
  View Profile
</Link>
```

---

## 6. Type-Safe Navigation

### Define Route Types
```tsx
// types/navigation.ts
export type RootStackParamList = {
  '(tabs)': undefined;
  '(auth)/login': undefined;
  'product/[id]': { id: string };
  'settings/[category]': { category: string };
};
```

### Use with TypeScript
```tsx
import { useLocalSearchParams } from 'expo-router';

// Fully typed params
const { id } = useLocalSearchParams<{ id: string }>();
```

---

## 7. Navigation Patterns

### Protected Routes
```tsx
// app/(protected)/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

export default function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Stack />;
}
```

### Modal Screens
```tsx
// app/_layout.tsx
<Stack>
  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  <Stack.Screen
    name="modal"
    options={{
      presentation: 'modal',
      headerTitle: 'Filter',
    }}
  />
</Stack>
```

---

## 8. Deep Linking Configuration

```json
// app.json
{
  "expo": {
    "scheme": "myapp",
    "web": {
      "bundler": "metro"
    }
  }
}
```

Test deep links:
```bash
# iOS Simulator
npx uri-scheme open "myapp://product/123" --ios

# Android Emulator
npx uri-scheme open "myapp://product/123" --android
```

---

## 9. Common Mistakes to Avoid

| Mistake | Solution |
|---------|----------|
| Missing `_layout.tsx` | Every folder with routes needs a layout |
| Wrong file naming | Use `index.tsx` for default routes |
| Forgetting groups | Use `(folder)` to organize without affecting URLs |
| Not handling loading | Always show loading state during auth checks |

---

> 📚 **Next:** Learn styling patterns → [STYLING_GUIDE.md](./04_STYLING_GUIDE.md)

