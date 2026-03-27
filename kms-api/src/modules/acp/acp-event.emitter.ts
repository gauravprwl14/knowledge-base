import { ReplaySubject } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { AcpEventType } from './external-agent/external-agent.types';

/**
 * AcpEventEmitter wraps a ReplaySubject<MessageEvent> for SSE streaming.
 *
 * WHY ReplaySubject(100) instead of Subject:
 * - Subject is "hot" — events emitted before any subscriber attaches are LOST
 * - The async pipeline in AcpService starts immediately and may emit events
 *   (e.g. tool_call_start) before NestJS's SSE adapter subscribes to the Observable
 * - ReplaySubject buffers the last 100 emissions, so late subscribers receive
 *   all events emitted so far. Buffer of 100 is generous — a full chat turn
 *   typically emits <50 events.
 */
export class AcpEventEmitter {
  // Buffer up to 100 events to handle late subscription from NestJS SSE adapter
  readonly subject = new ReplaySubject<MessageEvent>(100);

  /** Emits a text token chunk from the LLM. */
  emitChunk(text: string): void {
    this.subject.next({
      data: JSON.stringify({ type: 'agent_message_chunk' as AcpEventType, data: { text } }),
    } as MessageEvent);
  }

  /** Emits a tool_call_start event. */
  emitToolCallStart(toolName: string, args: Record<string, unknown>): void {
    this.subject.next({
      data: JSON.stringify({
        type: 'tool_call_start' as AcpEventType,
        data: { tool: toolName, args },
      }),
    } as MessageEvent);
  }

  /** Emits a tool_call_result event. */
  emitToolCallResult(toolName: string, resultCount: number): void {
    this.subject.next({
      data: JSON.stringify({
        type: 'tool_call_result' as AcpEventType,
        data: { tool: toolName, resultCount },
      }),
    } as MessageEvent);
  }

  /** Emits the terminal done event and completes the ReplaySubject. */
  emitDone(): void {
    this.subject.next({
      data: JSON.stringify({ type: 'done' as AcpEventType, data: {} }),
    } as MessageEvent);
    this.subject.complete();
  }

  /** Emits an error event and completes the ReplaySubject. */
  emitError(message: string): void {
    this.subject.next({
      data: JSON.stringify({ type: 'error' as AcpEventType, data: { message } }),
    } as MessageEvent);
    this.subject.complete();
  }
}
