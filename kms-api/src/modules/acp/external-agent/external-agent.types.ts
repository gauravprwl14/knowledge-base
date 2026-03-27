/** A single search result chunk returned by kms_search. */
export interface KmsSearchResult {
  fileId: string;
  filename: string;
  snippet: string;
  score: number;
  chunkIndex: number;
  sourceId: string;
}

/** Response envelope from kms_search tool. */
export interface KmsSearchResponse {
  results: KmsSearchResult[];
  total: number;
  took_ms: number;
  mode: string;
}

/** ACP SSE event types emitted during a prompt run. */
export type AcpEventType =
  | 'agent_message_chunk'
  | 'tool_call_start'
  | 'tool_call_result'
  | 'done'
  | 'error';

/** Shape of an ACP SSE event payload. */
export interface AcpEvent {
  type: AcpEventType;
  data: unknown;
}

/** Anthropic message role. */
export type AnthropicRole = 'user' | 'assistant';

/** Single message for Anthropic messages array. */
export interface AnthropicMessage {
  role: AnthropicRole;
  content: string;
}
