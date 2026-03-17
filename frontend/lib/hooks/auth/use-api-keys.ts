'use client';

/**
 * API Key hooks — query and mutation hooks for managing API keys.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
} from '@/lib/api/auth.api';
import type {
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from '@/lib/types/auth.types';

export const API_KEYS_QUERY_KEY = ['auth', 'api-keys'] as const;

// ---------------------------------------------------------------------------
// List API keys
// ---------------------------------------------------------------------------

export interface UseApiKeysReturn {
  apiKeys: ApiKey[];
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiKeys(): UseApiKeysReturn {
  const query = useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: listApiKeys,
    retry: 1,
  });

  const errorMessage = query.error
    ? (query.error as Error).message ?? 'Failed to load API keys.'
    : null;

  return {
    apiKeys: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: errorMessage,
    refetch: query.refetch,
  };
}

// ---------------------------------------------------------------------------
// Create API key
// ---------------------------------------------------------------------------

export interface UseCreateApiKeyReturn {
  createApiKey: (payload: CreateApiKeyRequest) => Promise<CreateApiKeyResponse>;
  isPending: boolean;
  isError: boolean;
  error: string | null;
  reset: () => void;
}

export function useCreateApiKey(): UseCreateApiKeyReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: () => {
      // Invalidate the list so it refetches with the new key metadata
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });

  const errorMessage = mutation.error
    ? (mutation.error as Error).message ?? 'Failed to create API key.'
    : null;

  return {
    createApiKey: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: errorMessage,
    reset: mutation.reset,
  };
}

// ---------------------------------------------------------------------------
// Revoke API key
// ---------------------------------------------------------------------------

export interface UseRevokeApiKeyReturn {
  revokeApiKey: (id: string) => Promise<void>;
  isPending: boolean;
  revokingId: string | null;
  error: string | null;
}

export function useRevokeApiKey(): UseRevokeApiKeyReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });

  const errorMessage = mutation.error
    ? (mutation.error as Error).message ?? 'Failed to revoke API key.'
    : null;

  return {
    revokeApiKey: mutation.mutateAsync,
    isPending: mutation.isPending,
    revokingId: mutation.variables ?? null,
    error: errorMessage,
  };
}
