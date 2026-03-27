/**
 * useChat — manages chat state and ACP session lifecycle.
 *
 * Handles:
 * - ACP session creation (lazily on first message send)
 * - Streaming token accumulation into ChatMessage objects
 * - Tool call display (kms_search invocation + result count)
 * - Error recovery (resets session so the next message creates a fresh one)
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import {
  acpCreateSession,
  acpPromptStream,
  acpCloseSession,
} from '@/lib/api/acp';

export type MessageRole = 'user' | 'assistant';

export interface ToolCallInfo {
  /** Tool name as reported by the agent, e.g. "kms_search". */
  tool: string;
  /** Arguments passed to the tool at invocation time. */
  args?: Record<string, unknown>;
  /** Number of chunks/results returned by the tool. */
  resultCount?: number;
}

export interface ChatMessage {
  /** Stable unique ID used as React key and for targeted state updates. */
  id: string;
  role: MessageRole;
  /** Accumulated response text — grows token-by-token during streaming. */
  content: string;
  /** Populated when the agent invokes a tool (e.g. kms_search). */
  toolCall?: ToolCallInfo;
  /** True while the SSE stream is still open for this message. */
  isStreaming?: boolean;
  /** Non-null when the stream terminated with an error event. */
  error?: string;
}

interface UseChatOptions {
  /** JWT access token used for ACP session and prompt requests. */
  token: string;
  /** Called whenever a fatal chat error occurs (network failure, ACP error). */
  onError?: (err: string) => void;
}

/**
 * Hook for ACP-powered chat with SSE streaming.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, isLoading, clearChat } = useChat({ token });
 * ```
 */
export function useChat({ token, onError }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Hold the session ID across renders without triggering re-renders
  const sessionIdRef = useRef<string | null>(null);

  /** Produce a simple collision-resistant ID for message objects. */
  const newId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  /**
   * Lazily create an ACP session on first use; reuse it on subsequent calls.
   * A new session is created automatically after a session error.
   */
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const id = await acpCreateSession(token);
    sessionIdRef.current = id;
    return id;
  }, [token]);

  /**
   * Send a user message and stream the assistant's response.
   *
   * The user message is appended immediately for responsive UX. A placeholder
   * assistant message is added at the same time, then updated in-place as SSE
   * events arrive. The placeholder approach avoids a layout shift when the
   * first token lands.
   *
   * @param text - The user's question text (leading/trailing whitespace stripped).
   */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Add user message immediately — don't wait for the ACP round-trip
      const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      // Insert an assistant placeholder that will be updated during streaming
      const assistantId = newId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const sessionId = await ensureSession();

        // Consume the SSE stream and update the placeholder message on each event
        for await (const event of acpPromptStream(sessionId, token, text)) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;

              switch (event.type) {
                case 'tool_call_start':
                  // Record which tool is being called and its arguments
                  return {
                    ...m,
                    toolCall: { tool: event.data.tool ?? '', args: event.data.args },
                  };

                case 'tool_call_result':
                  // Augment existing tool call with the count of results returned
                  return {
                    ...m,
                    toolCall: m.toolCall
                      ? { ...m.toolCall, resultCount: event.data.resultCount }
                      : undefined,
                  };

                case 'agent_message_chunk':
                  // Append the incoming token to the accumulated text
                  return { ...m, content: m.content + (event.data.text ?? '') };

                case 'done':
                  // Stream closed cleanly — mark message as no longer streaming
                  return { ...m, isStreaming: false };

                case 'error':
                  return { ...m, isStreaming: false, error: event.data.message };

                default:
                  return m;
              }
            }),
          );
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        onError?.(errMsg);
        // Show the error inside the placeholder assistant bubble
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false, error: errMsg } : m,
          ),
        );
        // Reset the session ref so the next message creates a fresh session
        sessionIdRef.current = null;
      } finally {
        setIsLoading(false);
      }
    },
    [token, isLoading, ensureSession, onError],
  );

  /**
   * Close the current ACP session (best-effort) and reset the message list.
   * Safe to call even when no session is active.
   */
  const clearChat = useCallback(async () => {
    if (sessionIdRef.current) {
      // Best-effort close — don't let errors block the UI reset
      await acpCloseSession(sessionIdRef.current, token).catch(() => {});
      sessionIdRef.current = null;
    }
    setMessages([]);
  }, [token]);

  return { messages, sendMessage, isLoading, clearChat };
}
