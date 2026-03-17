import { apiClient } from './client';

/**
 * Feature flags returned by the /features endpoint.
 * All flags default to false on the client if the request fails.
 */
export interface FeatureFlags {
  googleDrive: boolean;
  googleOAuthLogin: boolean;
  voiceTranscription: boolean;
  semanticSearch: boolean;
  rag: boolean;
}

/**
 * Fetches the current feature flag configuration from the API.
 *
 * @returns Resolved FeatureFlags object
 */
export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  return apiClient.get<FeatureFlags>('/features');
}
