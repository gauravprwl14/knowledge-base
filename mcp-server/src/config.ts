/**
 * MCP Server configuration.
 *
 * All values are sourced from environment variables so the server can be
 * run locally (pointing to http://localhost:8000) or inside Docker
 * (pointing to http://kms-api:8000).
 */
export interface McpServerConfig {
  /** Base URL for the kms-api service (e.g. http://localhost:8000) */
  kmsApiUrl: string;
  /** Base URL for the search-api service (e.g. http://localhost:8001) */
  searchApiUrl: string;
  /** JWT access token used to authenticate all kms-api requests */
  kmsApiToken: string;
  /** Whether to enable debug logging to stderr */
  debug: boolean;
}

/**
 * Resolves the MCP server configuration from environment variables.
 * All vars have sensible defaults for local development.
 */
export function getConfig(): McpServerConfig {
  return {
    kmsApiUrl: process.env.KMS_API_URL ?? 'http://localhost:8000',
    searchApiUrl: process.env.SEARCH_API_URL ?? 'http://localhost:8001',
    kmsApiToken: process.env.KMS_API_TOKEN ?? '',
    debug: process.env.MCP_DEBUG === 'true',
  };
}
