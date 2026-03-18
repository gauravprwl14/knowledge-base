/**
 * IExternalAgentAdapter — transport-agnostic interface for all external agent connections.
 *
 * Both `StdioAcpAdapter` (subprocess) and `HttpAcpAdapter` (HTTP) implement this
 * interface so that WorkflowEngine and AgentOrchestrator are decoupled from transport
 * details (ADR-0023: External Agent Adapter Pattern).
 *
 * Lifecycle for a stdio agent:
 *   ensureSession → sendPrompt → streamEvents → close
 *
 * Lifecycle for an HTTP agent:
 *   ensureSession → sendPrompt → streamEvents → close
 *   (same interface; HTTP adapter manages the stateless HTTP session internally)
 */
export interface IExternalAgentAdapter {
  /**
   * Ensures an ACP session is established with the external agent.
   * For stdio: spawns the subprocess if not already running and performs
   * the ACP /initialize handshake.
   * For HTTP: performs a GET /initialize call and caches capabilities.
   *
   * @param sessionId - The KMS-side session ID to correlate with the agent session.
   * @param userId    - The authenticated user's UUID (forwarded as x-user-id).
   * @returns The ACP session ID returned by the external agent.
   */
  ensureSession(sessionId: string, userId: string): Promise<string>;

  /**
   * Sends a prompt to the external agent and begins processing.
   * Does NOT await the full response — call streamEvents() to consume the SSE stream.
   *
   * @param agentSessionId - The agent-side session ID from ensureSession().
   * @param prompt         - The user prompt text to send.
   * @param context        - Optional context chunks to inject alongside the prompt.
   */
  sendPrompt(
    agentSessionId: string,
    prompt: string,
    context?: AgentContextChunk[],
  ): Promise<void>;

  /**
   * Returns an async iterable of ACP events streamed by the external agent.
   * Yields events until the `done` or `error` event is received.
   *
   * @param agentSessionId - The agent-side session ID from ensureSession().
   */
  streamEvents(agentSessionId: string): AsyncIterable<ExternalAgentEvent>;

  /**
   * Cancels any in-progress prompt for the given session.
   * For stdio: sends SIGTERM to the subprocess.
   * For HTTP: calls DELETE /sessions/{id}/prompt if the agent supports it.
   *
   * @param agentSessionId - The agent-side session ID to cancel.
   */
  cancel(agentSessionId: string): Promise<void>;

  /**
   * Closes the agent session and releases associated resources.
   * For stdio: terminates the subprocess.
   * For HTTP: calls DELETE /sessions/{id} if the agent supports cleanup.
   *
   * @param agentSessionId - The agent-side session ID to close.
   */
  close(agentSessionId: string): Promise<void>;

  /**
   * Health-checks the external agent.
   * For stdio: checks process liveness (exitCode === null).
   * For HTTP: performs GET /health or a capability probe.
   *
   * @returns `true` if the agent is healthy and ready to accept prompts.
   */
  healthCheck(): Promise<boolean>;
}

/** A single context chunk injected alongside a prompt. */
export interface AgentContextChunk {
  fileId: string;
  filename: string;
  content: string;
  score: number;
}

/** ACP event types emitted by the external agent stream. */
export type ExternalAgentEventType =
  | 'agent_message_chunk'
  | 'tool_call_start'
  | 'tool_call_result'
  | 'done'
  | 'error';

/** An event emitted by the external agent SSE stream. */
export interface ExternalAgentEvent {
  type: ExternalAgentEventType;
  data: unknown;
}

/** Agent transport types. */
export type AgentTransport = 'stdio' | 'http';

/**
 * Registry entry for an external agent.
 * Stored in the agent registry; resolved by ExternalAgentAdapterFactory.
 */
export interface ExternalAgentRegistryEntry {
  agentId: string;
  name: string;
  transport: AgentTransport;
  /**
   * For stdio agents: the shell command to invoke (e.g. "npx -y @zed-industries/claude-agent-acp").
   * Required when transport === "stdio".
   */
  command?: string;
  /**
   * For HTTP agents: the base URL of the ACP-over-HTTP server.
   * Required when transport === "http".
   */
  baseUrl?: string;
}
