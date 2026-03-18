'use client';

import { useState } from 'react';
import { ChatInput } from '@/components/features/chat/ChatInput';
import { ChatMessage } from '@/components/features/chat/ChatMessage';
import { useChat } from '@/lib/hooks/use-chat';

export default function ChatPage() {
  const { messages, isLoading, sendMessage } = useChat();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Ask anything about your knowledge base</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="animate-pulse">●</span>
            <span>Thinking...</span>
          </div>
        )}
      </div>
      <div className="border-t p-4">
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
}
