'use client';

/**
 * useMutation — lightweight mutation hook
 *
 * Mirrors the TanStack Query `useMutation` API surface so hooks can be
 * migrated to @tanstack/react-query with zero changes when it is added.
 *
 * NOTE: Replace this file entirely once @tanstack/react-query is installed.
 */

import { useCallback, useReducer } from 'react';
import { normaliseError } from '../api/client';
import type { ApiError } from '../types/common.types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type MutationStatus = 'idle' | 'loading' | 'success' | 'error';

interface MutationState<TData> {
  data: TData | null;
  error: ApiError | null;
  status: MutationStatus;
}

type MutationAction<TData> =
  | { type: 'MUTATE' }
  | { type: 'SUCCESS'; payload: TData }
  | { type: 'ERROR'; payload: ApiError }
  | { type: 'RESET' };

function mutationReducer<TData>(
  state: MutationState<TData>,
  action: MutationAction<TData>
): MutationState<TData> {
  switch (action.type) {
    case 'MUTATE':
      return { data: null, error: null, status: 'loading' };
    case 'SUCCESS':
      return { data: action.payload, error: null, status: 'success' };
    case 'ERROR':
      return { data: null, error: action.payload, status: 'error' };
    case 'RESET':
      return { data: null, error: null, status: 'idle' };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseMutationOptions<TData, TVariables> {
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onError?: (error: ApiError, variables: TVariables) => void | Promise<void>;
  onSettled?: (
    data: TData | null,
    error: ApiError | null,
    variables: TVariables
  ) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseMutationResult<TData, TVariables> {
  data: TData | null;
  error: ApiError | null;
  status: MutationStatus;
  isIdle: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  mutate: (variables: TVariables) => Promise<void>;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Lightweight mutation hook with the same API surface as TanStack Query's
 * `useMutation`. Replace with the real thing when @tanstack/react-query lands.
 *
 * @param mutationFn - Async function that performs the mutation
 * @param options - Lifecycle callbacks: onSuccess, onError, onSettled
 */
export function useMutation<TData = unknown, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: UseMutationOptions<TData, TVariables> = {}
): UseMutationResult<TData, TVariables> {
  const [state, dispatch] = useReducer(mutationReducer<TData>, {
    data: null,
    error: null,
    status: 'idle',
  });

  const mutateAsync = useCallback(
    async (variables: TVariables): Promise<TData> => {
      dispatch({ type: 'MUTATE' });
      try {
        const result = await mutationFn(variables);
        dispatch({ type: 'SUCCESS', payload: result });
        await options.onSuccess?.(result, variables);
        await options.onSettled?.(result, null, variables);
        return result;
      } catch (err) {
        const apiError = normaliseError(err);
        dispatch({ type: 'ERROR', payload: apiError });
        await options.onError?.(apiError, variables);
        await options.onSettled?.(null, apiError, variables);
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutationFn]
  );

  const mutate = useCallback(
    async (variables: TVariables): Promise<void> => {
      try {
        await mutateAsync(variables);
      } catch {
        // Swallow — error already in state
      }
    },
    [mutateAsync]
  );

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return {
    data: state.data,
    error: state.error,
    status: state.status,
    isIdle: state.status === 'idle',
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
    mutate,
    mutateAsync,
    reset,
  };
}
