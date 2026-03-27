/**
 * ChatMessage — renders a single chat message bubble with streaming support.
 *
 * Displays:
 * - User messages: right-aligned, blue background
 * - Assistant messages: left-aligned, grey background
 * - Tool call indicator: shows kms_search execution with query preview and result count
 * - Streaming indicator: animated dots while the SSE stream is still open
 * - Error state: red border with error text
 */
'use client';

import type { ChatMessage as ChatMessageType } from '@/lib/hooks/use-chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : message.error
              ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-gray-100 text-gray-900'
        }`}
      >
        {/* Tool call indicator — rendered above the response text while kms_search is running */}
        {message.toolCall && (
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            {/* Green dot signals the tool is active / has results */}
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
            <span>
              {message.toolCall.tool}
              {/* Show a preview of the search query if available */}
              {message.toolCall.args?.query !== undefined && (
                <span className="italic">
                  {' '}
                  &ldquo;{String(message.toolCall.args.query).slice(0, 40)}&rdquo;
                </span>
              )}
              {/* Show how many results were retrieved once the tool returns */}
              {message.toolCall.resultCount !== undefined && (
                <span> &rarr; {message.toolCall.resultCount} results</span>
              )}
            </span>
          </div>
        )}

        {/* Message text — accumulates token-by-token during streaming */}
        <p className="text-sm whitespace-pre-wrap">
          {message.content || (message.isStreaming ? '' : '...')}
        </p>

        {/* Animated bouncing dots — shown while streaming and content is empty */}
        {message.isStreaming && !message.content && (
          <span className="inline-flex gap-1 mt-1" aria-label="Streaming response">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
        )}

        {/* Error message rendered below content */}
        {message.error && (
          <p className="text-xs text-red-600 mt-1">{message.error}</p>
        )}
      </div>
    </div>
  );
}
