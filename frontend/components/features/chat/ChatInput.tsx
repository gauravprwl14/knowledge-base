/**
 * ChatInput — auto-resizing textarea with send button for the chat interface.
 *
 * Keyboard behaviour:
 * - Enter          → send message (prevents default newline insertion)
 * - Shift + Enter  → insert newline (natural multiline editing)
 *
 * Visual behaviour:
 * - Textarea grows up to ~5 lines (120px) then becomes scrollable
 * - Send button disabled while isLoading or input is empty/whitespace-only
 * - Loading spinner replaces "Send" label while request is in flight
 */
'use client';

import { KeyboardEvent, useRef, useState } from 'react';

interface ChatInputProps {
  /** Called with the trimmed user text when the message is submitted. */
  onSend: (text: string) => void;
  /** When true the input and button are disabled (assistant is responding). */
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, isLoading, placeholder }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Submit the current text, then reset the textarea to a single row. */
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setText('');
    // Explicitly reset height so the textarea collapses back to one row
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Prevent the default newline — we're treating plain Enter as "send"
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter falls through to the default behaviour (newline)
  };

  return (
    <div className="flex gap-2 items-end border-t border-gray-200 pt-4">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // Auto-resize: reset to auto first so shrinking also works
          e.target.style.height = 'auto';
          // Cap at 120px (~5 lines) to keep the input from consuming the page
          e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Ask your knowledge base...'}
        disabled={isLoading}
        rows={1}
        className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={isLoading || !text.trim()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Send message"
      >
        {isLoading ? (
          // Spinning ring — indicates the assistant is thinking
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          'Send'
        )}
      </button>
    </div>
  );
}
