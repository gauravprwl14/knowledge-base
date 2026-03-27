# 🧪 Testing Handbook

We take testing seriously. This project uses **Vitest** and **React Testing Library** to ensure reliability and catch regressions early.

## 1. Testing Philosophy

- **High Coverage**: We aim for maximum coverage of our business logic and critical UI interactions.
- **Negative Cases**: Don't just test the happy path. Test what happens when an input is empty, a network request fails, or a user enters invalid data.
- **Unit vs. Integration**:
  - **Unit Tests**: Test individual functions or small components in isolation (e.g., `utils.ts`).
  - **Integration Tests**: Test how multiple components work together (e.g., `SearchBar` state and callbacks).

## 2. Running Tests

- `npm run test`: Run all tests once.
- `npm run test:watch`: Run tests in watch mode (best for development).
- `npm run test:coverage`: Generate a detailed coverage report in `coverage/`.

## 3. How to Write a Test

Create tests in a `__tests__` folder adjacent to the code being tested. Name the file `[name].test.ts` or `[name].test.tsx`.

### Example: Testing a Utility

```ts
import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn utility', () => {
  it('should merge classes', () => {
    expect(cn('a', 'b')).toBe('a b');
  });
});
```

### Example: Testing a Component

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../button';

it('should handle clicks', () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click</Button>);
  fireEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalled();
});
```

## 4. Best Practices

- **Use `vi.fn()`**: Mock functions to track if they were called and with what arguments.
- **Fake Timers**: If your code uses `setTimeout` (like debouncing), use `vi.useFakeTimers()` in your tests.
- **`jest-dom` Matchers**: Use matchers like `toBeInTheDocument()`, `toHaveClass()`, and `toBeDisabled()` for readable assertions.
- **Accessibility**: Test that your components have the correct roles and labels using `getByRole` and `getByLabelText`.

> [!WARNING]
> Always cleanup tests! Our setup file handles `cleanup()` automatically after each test, but be careful with global mocks or timers.

## 5. Automated Quality Checks (Git Hooks)

We use **Husky** and **lint-staged** to ensure that every commit meets our quality standards.

- **Pre-commit Hook**: Automatically runs `eslint --fix` and `vitest related --run` on your staged files. This prevents linting errors and broken tests from entering the codebase.
- **Pre-push Hook**: Runs the full test suite (`npm run test`) and type checking (`npx tsc --noEmit`) before you push to the remote repository.

These hooks are installed automatically when you run `npm install`.

---

> [!NOTE]
> See the `src/features/blog/components/__tests__/SearchBar.test.tsx` file for a comprehensive example of debouncing and edge case testing.
