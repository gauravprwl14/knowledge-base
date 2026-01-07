# 🚨 Mobile Error Handling Guide

> **Goal:** Implement robust, user-friendly error handling in React Native apps.

---

## 1. Error Categories

| Category | Code Prefix | Example |
|----------|-------------|---------|
| **Network** | `NET` | NET1001 - No internet connection |
| **Validation** | `VAL` | VAL1001 - Invalid email format |
| **Authentication** | `AUTH` | AUTH1001 - Session expired |
| **Server** | `SRV` | SRV1001 - Internal server error |
| **Client** | `CLT` | CLT1001 - Invalid input |

---

## 2. Error Structure

```tsx
// lib/errors/types.ts
/**
 * @description Standard error structure used across the app
 */
export interface AppError {
  /** Unique error code (e.g., NET1001) */
  code: string;
  /** User-friendly error message */
  message: string;
  /** i18n key for localized message */
  messageKey: string;
  /** Error category for handling logic */
  category: ErrorCategory;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Additional error data */
  data?: Record<string, unknown>;
  /** Original error for debugging */
  originalError?: Error;
}

export type ErrorCategory = 
  | 'NETWORK'
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'SERVER'
  | 'CLIENT'
  | 'UNKNOWN';
```

---

## 3. Error Factory

```tsx
// lib/errors/factory.ts
import { AppError, ErrorCategory } from './types';

/**
 * @description Creates standardized app errors
 */
export function createError(
  code: string,
  message: string,
  category: ErrorCategory,
  options?: {
    messageKey?: string;
    statusCode?: number;
    data?: Record<string, unknown>;
    originalError?: Error;
  }
): AppError {
  return {
    code,
    message,
    messageKey: options?.messageKey || `error.${code.toLowerCase()}`,
    category,
    statusCode: options?.statusCode,
    data: options?.data,
    originalError: options?.originalError,
  };
}

/**
 * @description Predefined error creators
 */
export const Errors = {
  network: {
    noConnection: () => createError(
      'NET1001',
      'No internet connection',
      'NETWORK',
      { messageKey: 'error.network.no_connection' }
    ),
    timeout: () => createError(
      'NET1002',
      'Request timed out',
      'NETWORK',
      { messageKey: 'error.network.timeout' }
    ),
  },
  
  auth: {
    sessionExpired: () => createError(
      'AUTH1001',
      'Your session has expired',
      'AUTHENTICATION',
      { messageKey: 'error.auth.session_expired', statusCode: 401 }
    ),
    invalidCredentials: () => createError(
      'AUTH1002',
      'Invalid email or password',
      'AUTHENTICATION',
      { messageKey: 'error.auth.invalid_credentials', statusCode: 401 }
    ),
  },
  
  validation: {
    invalidEmail: () => createError(
      'VAL1001',
      'Please enter a valid email',
      'VALIDATION',
      { messageKey: 'error.validation.invalid_email' }
    ),
    required: (field: string) => createError(
      'VAL1002',
      `${field} is required`,
      'VALIDATION',
      { messageKey: 'error.validation.required', data: { field } }
    ),
  },
  
  server: {
    internal: () => createError(
      'SRV1001',
      'Something went wrong. Please try again.',
      'SERVER',
      { messageKey: 'error.server.internal', statusCode: 500 }
    ),
  },
};
```

---

## 4. API Error Handler

```tsx
// lib/api/errorHandler.ts
import axios, { AxiosError } from 'axios';
import { AppError } from '@/lib/errors/types';
import { Errors, createError } from '@/lib/errors/factory';

/**
 * @description Transforms API errors into AppError format
 */
export function handleApiError(error: unknown): AppError {
  // Network error (no response)
  if (axios.isAxiosError(error) && !error.response) {
    if (error.code === 'ECONNABORTED') {
      return Errors.network.timeout();
    }
    return Errors.network.noConnection();
  }

  // API error with response
  if (axios.isAxiosError(error) && error.response) {
    const { status, data } = error.response;

    // Use server-provided error if available
    if (data?.code && data?.message) {
      return createError(
        data.code,
        data.message,
        categorizeByStatus(status),
        {
          statusCode: status,
          data: data.data,
          originalError: error,
        }
      );
    }

    // Fallback based on status code
    switch (status) {
      case 401:
        return Errors.auth.sessionExpired();
      case 403:
        return createError('AUTH1003', 'Access denied', 'AUTHORIZATION', { statusCode: 403 });
      case 404:
        return createError('CLT1001', 'Resource not found', 'CLIENT', { statusCode: 404 });
      case 422:
        return createError('VAL1000', 'Validation failed', 'VALIDATION', { statusCode: 422 });
      case 500:
      default:
        return Errors.server.internal();
    }
  }

  // Unknown error
  return createError(
    'UNK1001',
    'An unexpected error occurred',
    'UNKNOWN',
    { originalError: error instanceof Error ? error : new Error(String(error)) }
  );
}

function categorizeByStatus(status: number): ErrorCategory {
  if (status === 401) return 'AUTHENTICATION';
  if (status === 403) return 'AUTHORIZATION';
  if (status >= 400 && status < 500) return 'CLIENT';
  if (status >= 500) return 'SERVER';
  return 'UNKNOWN';
}
```

---

## 5. Global Error Boundary

```tsx
// components/common/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from '@/components/ui';
import * as Sentry from '@sentry/react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * @description Catches JavaScript errors anywhere in child component tree
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error reporting service
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            We're sorry, but something unexpected happened.
          </Text>
          <Button onPress={this.handleRetry}>Try Again</Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  message: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
});
```

---

## 6. Error Display Hook

```tsx
// hooks/useErrorHandler.ts
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { AppError } from '@/lib/errors/types';
import { handleApiError } from '@/lib/api/errorHandler';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * @description Hook for handling and displaying errors
 */
export function useErrorHandler() {
  const [error, setError] = useState<AppError | null>(null);
  const { t } = useTranslation();

  const handleError = useCallback((err: unknown) => {
    const appError = handleApiError(err);
    setError(appError);

    // Handle specific error categories
    switch (appError.category) {
      case 'AUTHENTICATION':
        // Redirect to login
        // router.replace('/login');
        break;
      case 'NETWORK':
        Alert.alert(
          t('error.network.title'),
          t(appError.messageKey)
        );
        break;
      default:
        // Log for debugging in dev
        if (__DEV__) {
          console.error('App Error:', appError);
        }
    }

    return appError;
  }, [t]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    error,
    handleError,
    clearError,
  };
}
```

---

## 7. Error Display Components

### Inline Error Message
```tsx
// components/ui/ErrorMessage.tsx
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants';

interface ErrorMessageProps {
  message: string;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.error + '10',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  text: {
    color: colors.error,
    fontSize: 14,
  },
});
```

### Full Screen Error
```tsx
// components/common/ErrorScreen.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Button } from '@/components/ui';

interface ErrorScreenProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorScreen({
  title = 'Oops!',
  message = 'Something went wrong',
  onRetry,
}: ErrorScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Button onPress={onRetry}>Try Again</Button>
      )}
    </View>
  );
}
```

---

## 8. Usage Examples

### In Components
```tsx
function ProductScreen() {
  const { data, error, refetch } = useProducts();
  const { handleError } = useErrorHandler();

  useEffect(() => {
    if (error) {
      handleError(error);
    }
  }, [error]);

  if (error) {
    return <ErrorScreen message={error.message} onRetry={refetch} />;
  }

  return <ProductList products={data} />;
}
```

### In API Calls
```tsx
async function submitForm(data: FormData) {
  try {
    const response = await api.post('/submit', data);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}
```

---

## 9. Error Monitoring Integration

```tsx
// lib/monitoring/sentry.ts
import * as Sentry from '@sentry/react-native';
import { AppError } from '@/lib/errors/types';

export function initErrorMonitoring() {
  Sentry.init({
    dsn: 'YOUR_SENTRY_DSN',
    environment: __DEV__ ? 'development' : 'production',
    enableNative: true,
  });
}

export function captureError(error: AppError) {
  Sentry.captureException(error.originalError || new Error(error.message), {
    tags: {
      errorCode: error.code,
      category: error.category,
    },
    extra: {
      data: error.data,
    },
  });
}
```

---

> 📚 **Next:** Learn about loading states → [LOADING_STATES.md](./08_LOADING_STATES.md)

