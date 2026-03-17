'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchFeatureFlags, type FeatureFlags } from '../api/features';

const DEFAULT_FLAGS: FeatureFlags = {
  googleDrive: false,
  googleOAuthLogin: false,
  voiceTranscription: false,
  semanticSearch: false,
  rag: false,
};

/**
 * Returns the current feature flag set.
 * Falls back to all-false defaults if the request has not yet resolved or fails.
 * Results are cached for 5 minutes — flags rarely change at runtime.
 */
export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFeatureFlags,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT_FLAGS;
}
