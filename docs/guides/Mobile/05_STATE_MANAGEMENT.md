# 🔄 Mobile State Management

> **Goal:** Choose the right state management tool for each type of state in React Native.

---

## 1. State Categories

| Type | Description | Tool |
|------|-------------|------|
| **Server State** | Data from API | TanStack Query (React Query) |
| **UI State** | Modals, toggles | `useState`, Context |
| **Form State** | Input values, validation | React Hook Form |
| **App State** | Theme, language, auth | Zustand, Context |
| **Navigation State** | Current route, params | Expo Router |

---

## 2. Server State with TanStack Query

### Setup
```bash
npm install @tanstack/react-query
```

### Provider Configuration
```tsx
// providers/QueryProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Fetching Data
```tsx
// features/products/hooks/useProducts.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  price: number;
}

/**
 * @description Fetches list of products
 * @returns Query result with products array
 */
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const response = await api.get('/products');
      return response.data;
    },
  });
}

// Usage in component
function ProductList() {
  const { data: products, isLoading, error } = useProducts();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <FlatList
      data={products}
      renderItem={({ item }) => <ProductCard product={item} />}
    />
  );
}
```

### Mutations (Create/Update/Delete)
```tsx
// features/products/hooks/useCreateProduct.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newProduct: CreateProductInput) => {
      const response = await api.post('/products', newProduct);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch products list
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

// Usage
function AddProductForm() {
  const { mutate, isPending, error } = useCreateProduct();

  const handleSubmit = (data: FormData) => {
    mutate(data, {
      onSuccess: () => {
        Alert.alert('Success', 'Product created!');
      },
    });
  };

  return <Form onSubmit={handleSubmit} isLoading={isPending} />;
}
```

---

## 3. Form State with React Hook Form

### Setup
```bash
npm install react-hook-form zod @hookform/resolvers
```

### Basic Form
```tsx
// features/auth/components/LoginForm.tsx
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '@/components/ui';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    // Handle login
    await loginUser(data);
  };

  return (
    <View>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <Input
            label="Email"
            value={value}
            onChangeText={onChange}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}
      />
      
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <Input
            label="Password"
            value={value}
            onChangeText={onChange}
            error={errors.password?.message}
            secureTextEntry
          />
        )}
      />
      
      <Button 
        onPress={handleSubmit(onSubmit)}
        isLoading={isSubmitting}
      >
        Login
      </Button>
    </View>
  );
}
```

---

## 4. Global App State with Zustand

### Setup
```bash
npm install zustand
```

### Creating a Store
```tsx
// stores/authStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      
      setUser: (user, token) => set({
        user,
        token,
        isAuthenticated: true,
      }),
      
      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
      }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

### Using the Store
```tsx
// In components
function ProfileScreen() {
  const { user, logout } = useAuthStore();

  return (
    <View>
      <Text>Welcome, {user?.name}</Text>
      <Button onPress={logout}>Logout</Button>
    </View>
  );
}

// For auth checks
function useAuth() {
  const { isAuthenticated, token } = useAuthStore();
  return { isAuthenticated, token };
}
```

---

## 5. Context for UI State

### When to Use Context
- Theme switching
- Language preference
- Modal/sheet visibility (when needed across components)

### Example: Theme Context
```tsx
// Already covered in STYLING_GUIDE.md
// Use Context for theme, language, and similar app-wide UI preferences
```

---

## 6. State Management Decision Tree

```text
Is the data from an API?
├── YES → Use TanStack Query
└── NO
    ├── Is it form input data?
    │   ├── YES → Use React Hook Form
    │   └── NO
    │       ├── Is it needed by multiple screens?
    │       │   ├── YES → Use Zustand (or Context for simple cases)
    │       │   └── NO → Use local useState
    │       └── Does it need to persist?
    │           ├── YES → Use Zustand with persist middleware
    │           └── NO → Use useState or Context
```

---

## 7. Rules for State Management

### ✅ Do's
| Rule | Reason |
|------|--------|
| Keep state close to where it's used | Reduces complexity |
| Use TanStack Query for all API data | Handles caching, loading, errors |
| Validate forms with Zod | Type-safe validation |
| Persist auth state | User stays logged in |

### ❌ Don'ts
| Anti-Pattern | Why |
|--------------|-----|
| Put API data in Zustand/Redux | TanStack Query handles this better |
| useState for form fields | Use React Hook Form |
| Prop drilling 3+ levels | Use context or composition |
| Global state for local UI | Keep it local |

---

## 8. Async Storage for Persistence

```tsx
// lib/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Type-safe async storage wrapper
 */
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    await AsyncStorage.clear();
  },
};
```

---

> 📚 **Next:** Learn testing strategies → [TESTING_GUIDE.md](./06_TESTING_GUIDE.md)

