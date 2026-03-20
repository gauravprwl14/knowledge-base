'use client';

import { ChatInput } from '@/components/features/chat/ChatInput';
import { ChatMessage } from '@/components/features/chat/ChatMessage';
import { useChat } from '@/lib/hooks/use-chat';
import { useAccessToken } from '@/lib/stores/auth.store';

export default function ChatPage() {
  const token = useAccessToken() ?? '';
  const { messages, isLoading, sendMessage } = useChat({ token });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-slate-400 text-sm">Ask anything about your knowledge base</p>
              <p className="text-slate-700 text-xs">Your indexed files and sources will be searched automatically</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <span className="inline-flex gap-0.5">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
            </span>
            <span>Thinking...</span>
          </div>
        )}
      </div>
      <div className="border-t border-white/5 p-4">
        <ChatInput onSend={sendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
}
