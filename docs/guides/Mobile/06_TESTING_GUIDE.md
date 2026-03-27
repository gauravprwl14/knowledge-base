# 🧪 Mobile Testing Guide

> **Goal:** Write reliable tests for React Native apps using Jest and React Native Testing Library.

---

## 1. Testing Philosophy

| Principle | Description |
|-----------|-------------|
| **Test Behavior** | Test what the user sees and does, not implementation details |
| **Pyramid Strategy** | Many unit tests, some integration tests, few E2E tests |
| **Coverage Goals** | Aim for 80%+ on business logic, critical paths |

---

## 2. Testing Tools

| Tool | Purpose |
|------|---------|
| **Jest** | Test runner, assertions, mocking |
| **React Native Testing Library** | Component testing utilities |
| **MSW** | API mocking |
| **Detox** | End-to-end testing (optional) |

### Installation
```bash
npm install --save-dev @testing-library/react-native @testing-library/jest-native
```

---

## 3. Test File Structure

```text
src/
├── components/
│   └── ui/
│       └── Button/
│           ├── Button.tsx
│           ├── Button.test.tsx    # Unit test
│           └── index.ts
├── features/
│   └── auth/
│       ├── components/
│       │   └── LoginForm.test.tsx # Integration test
│       └── hooks/
│           └── useAuth.test.ts    # Hook test
└── __mocks__/                     # Global mocks
    └── @react-native-async-storage/
        └── async-storage.ts
```

---

## 4. Unit Testing Components

### Basic Component Test
```tsx
// components/ui/Button/Button.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from './Button';

describe('Button', () => {
  it('renders button text correctly', () => {
    render(<Button>Click me</Button>);
    
    expect(screen.getByText('Click me')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Press</Button>);
    
    fireEvent.press(screen.getByRole('button'));
    
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows loading spinner when isLoading is true', () => {
    render(<Button isLoading>Submit</Button>);
    
    expect(screen.getByTestId('loading-indicator')).toBeTruthy();
    expect(screen.queryByText('Submit')).toBeNull();
  });

  it('is disabled when disabled prop is true', () => {
    const onPress = jest.fn();
    render(<Button disabled onPress={onPress}>Disabled</Button>);
    
    fireEvent.press(screen.getByRole('button'));
    
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

### Testing with Variants
```tsx
describe('Button variants', () => {
  it.each([
    ['primary', 'bg-primary'],
    ['secondary', 'bg-secondary'],
    ['outline', 'border-primary'],
  ])('renders %s variant with correct styles', (variant, expectedClass) => {
    render(<Button variant={variant as any}>Test</Button>);
    
    // Assert based on your styling approach
    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
  });
});
```

---

## 5. Testing Hooks

### Custom Hook Test
```tsx
// features/auth/hooks/useAuth.test.ts
import { renderHook, act } from '@testing-library/react-native';
import { useAuth } from './useAuth';

// Mock the auth store
jest.mock('@/stores/authStore', () => ({
  useAuthStore: jest.fn(() => ({
    user: null,
    isAuthenticated: false,
    setUser: jest.fn(),
    logout: jest.fn(),
  })),
}));

describe('useAuth', () => {
  it('returns initial unauthenticated state', () => {
    const { result } = renderHook(() => useAuth());
    
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('logs in user successfully', async () => {
    const { result } = renderHook(() => useAuth());
    
    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });
    
    // Assert login was called with correct params
    expect(mockSetUser).toHaveBeenCalled();
  });
});
```

---

## 6. Integration Testing

### Form Integration Test
```tsx
// features/auth/components/LoginForm.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginForm } from './LoginForm';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockNavigate }),
}));

// Mock API
jest.mock('@/lib/api', () => ({
  post: jest.fn(),
}));

describe('LoginForm Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows validation errors for empty fields', async () => {
    render(<LoginForm />);
    
    fireEvent.press(screen.getByText('Login'));
    
    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeTruthy();
      expect(screen.getByText('Password is required')).toBeTruthy();
    });
  });

  it('shows error for invalid email', async () => {
    render(<LoginForm />);
    
    fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
    fireEvent.press(screen.getByText('Login'));
    
    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeTruthy();
    });
  });

  it('submits form with valid data', async () => {
    const mockLogin = require('@/lib/api').post;
    mockLogin.mockResolvedValueOnce({ data: { token: 'abc123' } });
    
    render(<LoginForm />);
    
    fireEvent.changeText(screen.getByLabelText('Email'), 'test@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
    fireEvent.press(screen.getByText('Login'));
    
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('shows error message on login failure', async () => {
    const mockLogin = require('@/lib/api').post;
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    
    render(<LoginForm />);
    
    fireEvent.changeText(screen.getByLabelText('Email'), 'test@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrongpassword');
    fireEvent.press(screen.getByText('Login'));
    
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeTruthy();
    });
  });
});
```

---

## 7. Mocking Patterns

### AsyncStorage Mock
```tsx
// __mocks__/@react-native-async-storage/async-storage.ts
const mockStorage: Record<string, string> = {};

export default {
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
    return Promise.resolve();
  }),
  getItem: jest.fn((key: string) => {
    return Promise.resolve(mockStorage[key] || null);
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStorage[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    return Promise.resolve();
  }),
};
```

### Navigation Mock
```tsx
// __mocks__/expo-router.ts
export const useRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
}));

export const useLocalSearchParams = jest.fn(() => ({}));
export const useSegments = jest.fn(() => []);
```

### API Mock with MSW
```tsx
// __mocks__/handlers.ts
import { rest } from 'msw';

export const handlers = [
  rest.post('/api/auth/login', (req, res, ctx) => {
    const { email, password } = req.body as any;
    
    if (email === 'test@example.com' && password === 'password123') {
      return res(ctx.json({ token: 'mock-token', user: { id: '1' } }));
    }
    
    return res(ctx.status(401), ctx.json({ message: 'Invalid credentials' }));
  }),
];
```

---

## 8. Test Configuration

### Jest Config
```js
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
  ],
};
```

---

## 9. Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- Button.test.tsx

# Update snapshots
npm test -- -u
```

---

## 10. Testing Best Practices

### ✅ Do's
| Practice | Reason |
|----------|--------|
| Use `screen` queries | More readable and maintainable |
| Test user behavior | Not implementation details |
| Use `waitFor` for async | Handles timing properly |
| Clear mocks in `beforeEach` | Prevents test pollution |

### ❌ Don'ts
| Anti-Pattern | Why |
|--------------|-----|
| Test internal state | Tests become brittle |
| Use `container` for queries | Use `screen` instead |
| Skip error cases | They catch real bugs |
| Copy-paste tests | Create test utilities |

---

> 📚 **Next:** Learn error handling → [ERROR_HANDLING.md](./07_ERROR_HANDLING.md)

