/**
 * Mock handler — ACP (Agent Chat Protocol)
 *
 * Matches the exact function signatures in lib/api/acp.ts.
 * Simulates SSE streaming via an async generator with realistic per-token delays.
 *
 * Swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 */

import { pickSequence } from '../data/chat.data';
import type { AcpCapabilities, AcpEvent } from '@/lib/api/acp';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function mockAcpInitialize(): Promise<AcpCapabilities> {
  await delay(200);
  return {
    protocolVersion: 1,
    agentCapabilities: {
      tools: [
        {
          name: 'kms_search',
          description: 'Search the knowledge base for relevant chunks.',
          parameters: { query: { type: 'string' }, limit: { type: 'number' } },
        },
        {
          name: 'kms_store',
          description: 'Store a new piece of knowledge into the knowledge base.',
          parameters: { content: { type: 'string' }, title: { type: 'string' } },
        },
      ],
    },
  };
}

export async function mockAcpCreateSession(_token: string): Promise<string> {
  await delay(150);
  return `mock-session-${Date.now()}`;
}

export async function* mockAcpPromptStream(
  _sessionId: string,
  _token: string,
  question: string,
): AsyncGenerator<AcpEvent> {
  const sequence = pickSequence(question);

  for (const frame of sequence) {
    await delay(frame.delayMs);
    yield frame.event;
    // Stop iterating after terminal events
    if (frame.event.type === 'done' || frame.event.type === 'error') return;
  }
}

export async function mockAcpCloseSession(_sessionId: string, _token: string): Promise<void> {
  await delay(100);
}
