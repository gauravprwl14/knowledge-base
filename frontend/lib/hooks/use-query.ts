'use client';

/**
 * useQuery — lightweight async data-fetching hook
 *
 * Mirrors the TanStack Query `useQuery` API surface so hooks can be
 * migrated to @tanstack/react-query with zero changes when it is added.
 *
 * NOTE: Replace this file entirely once @tanstack/react-query is installed.
 * This implementation has no caching, deduplication, or background refetch.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { normaliseError } from '../api/client';
import type { ApiError } from '../types/common.types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

interface QueryState<TData> {
  data: TData | undefined;
  error: ApiError | null;
  status: QueryStatus;
}

type QueryAction<TData> =
  | { type: 'FETCH' }
  | { type: 'SUCCESS'; payload: TData }
  | { type: 'ERROR'; payload: ApiError }
  | { type: 'RESET' };

function queryReducer<TData>(
  state: QueryState<TData>,
  action: QueryAction<TData>
): QueryState<TData> {
  switch (action.type) {
    case 'FETCH':
      return { ...state, error: null, status: 'loading' };
    case 'SUCCESS':
      return { data: action.payload, error: null, status: 'success' };
    case 'ERROR':
      return { ...state, error: action.payload, status: 'error' };
    case 'RESET':
      return { data: undefined, error: null, status: 'idle' };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseQueryOptions<TData> {
  /** Only run the query when this is true (default: true) */
  enabled?: boolean;
  onSuccess?: (data: TData) => void | Promise<void>;
  onError?: (error: ApiError) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseQueryResult<TData> {
  data: TData | undefined;
  error: ApiError | null;
  status: QueryStatus;
  isIdle: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Lightweight data-fetching hook with the same API surface as TanStack Query's
 * `useQuery`. Replace with the real thing when @tanstack/react-query lands.
 *
 * @param queryKey - Array key that identifies the query (for future caching)
 * @param queryFn - Async function that fetches data
 * @param options - enabled flag and lifecycle callbacks
 */
export function useQuery<TData = unknown>(
  _queryKey: readonly unknown[],
  queryFn: () => Promise<TData>,
  options: UseQueryOptions<TData> = {}
): UseQueryResult<TData> {
  const { enabled = true, onSuccess, onError } = options;

  const [state, dispatch] = useReducer(queryReducer<TData>, {
    data: undefined,
    error: null,
    status: enabled ? 'loading' : 'idle',
  });

  // Keep callbacks in a ref to avoid stale closure issues
  const callbacksRef = useRef({ onSuccess, onError });
  callbacksRef.current = { onSuccess, onError };

  const fetchRef = useRef(false);

  const execute = useCallback(async () => {
    if (!enabled) return;
    dispatch({ type: 'FETCH' });
    fetchRef.current = true;
    try {
      const result = await queryFn();
      dispatch({ type: 'SUCCESS', payload: result });
      await callbacksRef.current.onSuccess?.(result);
    } catch (err) {
      const apiError = normaliseError(err);
      dispatch({ type: 'ERROR', payload: apiError });
      await callbacksRef.current.onError?.(apiError);
    }
  // queryFn intentionally excluded — use enabled/refetch to control re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    execute();
  }, [execute]);

  const refetch = useCallback(() => {
    execute();
  }, [execute]);

  return {
    data: state.data,
    error: state.error,
    status: state.status,
    isIdle: state.status === 'idle',
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
    refetch,
  };
}
