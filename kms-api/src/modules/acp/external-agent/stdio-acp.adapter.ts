import { Injectable } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import { AppLogger } from '../../../logger/logger.service';
import { AppError } from '../../../errors/types/app-error';
import { ERROR_CODES } from '../../../errors/error-codes';
import {
  IExternalAgentAdapter,
  AgentContextChunk,
  ExternalAgentEvent,
  ExternalAgentRegistryEntry,
} from './external-agent.interface';

/**
 * StdioAcpAdapter — ACP-over-stdio subprocess transport adapter.
 *
 * Implements IExternalAgentAdapter (ADR-0023) for subprocess-based agents such as
 * `claude-code` (`npx -y @zed-industries/claude-agent-acp`) and `codex`
 * (`npx @zed-industries/codex-acp`).
 *
 * Session lifecycle:
 * 1. `ensureSession()` — spawns subprocess, reads ACP /initialize over stdin/stdout
 * 2. `sendPrompt()`    — writes JSON-encoded prompt to subprocess stdin
 * 3. `streamEvents()`  — reads NDJSON lines from subprocess stdout
 * 4. `close()`         — sends SIGTERM to subprocess; waits for clean exit
 *
 * Process pool constraint (ADR-0023): maximum 3 concurrent stdio sessions per user.
 * Enforced by `ExternalAgentAdapterFactory` before calling `ensureSession()`.
 *
 * @example
 * ```typescript
 * const adapter = new StdioAcpAdapter(entry, logger);
 * const agentSessionId = await adapter.ensureSession(sessionId, userId);
 * await adapter.sendPrompt(agentSessionId, 'List all documents about RAG');
 * for await (const event of adapter.streamEvents(agentSessionId)) {
 *   if (event.type === 'done') break;
 * }
 * await adapter.close(agentSessionId);
 * ```
 */
@Injectable()
export class StdioAcpAdapter implements IExternalAgentAdapter {
  private readonly logger: AppLogger;
  private readonly command: string;
  private readonly agentId: string;

  /** Currently running subprocess (one per adapter instance / session). */
  private process: ChildProcess | null = null;
  private agentSessionId: string | null = null;

  /**
   * @param entry  - Registry entry for the agent (must have transport === "stdio")
   * @param logger - Bound AppLogger instance
   */
  constructor(entry: ExternalAgentRegistryEntry, logger: AppLogger) {
    if (!entry.command) {
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: `StdioAcpAdapter: registry entry ${entry.agentId} is missing command`,
      });
    }
    this.command = entry.command;
    this.agentId = entry.agentId;
    this.logger = logger.child({ context: StdioAcpAdapter.name, agentId: entry.agentId });
  }

  /** {@inheritdoc IExternalAgentAdapter.ensureSession} */
  async ensureSession(sessionId: string, userId: string): Promise<string> {
    this.logger.info('StdioAcpAdapter: spawning subprocess', { command: this.command, sessionId });

    const [cmd, ...args] = this.command.split(' ');
    this.process = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        KMS_SESSION_ID: sessionId,
        KMS_USER_ID: userId,
      },
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.logger.warn('StdioAcpAdapter: subprocess stderr', {
        agentId: this.agentId,
        stderr: data.toString('utf8').trim(),
      });
    });

    this.process.on('exit', (code, signal) => {
      this.logger.info('StdioAcpAdapter: subprocess exited', { agentId: this.agentId, code, signal });
      this.process = null;
    });

    // ACP handshake — write initialize request to stdin
    const initRequest = JSON.stringify({ protocolVersion: 1, agentCapabilities: {} }) + '\n';
    this.process.stdin!.write(initRequest);

    // Read the initialize response line from stdout
    const firstLine = await this.readLine();
    let initResp: any;
    try {
      initResp = JSON.parse(firstLine);
    } catch {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `StdioAcpAdapter: malformed initialize response from ${this.agentId}`,
      });
    }

    // Create session
    const createSessionReq = JSON.stringify({ type: 'create_session', cwd: undefined }) + '\n';
    this.process.stdin!.write(createSessionReq);

    const sessionLine = await this.readLine();
    let sessionResp: any;
    try {
      sessionResp = JSON.parse(sessionLine);
    } catch {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `StdioAcpAdapter: malformed session response from ${this.agentId}`,
      });
    }

    this.agentSessionId = sessionResp.sessionId as string;
    this.logger.info('StdioAcpAdapter: session established', {
      agentSessionId: this.agentSessionId,
      protocolVersion: initResp.protocolVersion,
    });

    return this.agentSessionId;
  }

  /** {@inheritdoc IExternalAgentAdapter.sendPrompt} */
  async sendPrompt(
    agentSessionId: string,
    prompt: string,
    context: AgentContextChunk[] = [],
  ): Promise<void> {
    this.assertProcessAlive();
    const payload = {
      type: 'prompt',
      sessionId: agentSessionId,
      prompt: [
        { type: 'text', text: prompt },
        ...(context.length > 0
          ? [{ type: 'text', text: `\n\nContext:\n${context.map((c) => c.content).join('\n---\n')}` }]
          : []),
      ],
    };
    this.process!.stdin!.write(JSON.stringify(payload) + '\n');
    this.logger.info('StdioAcpAdapter: prompt sent', { agentSessionId, promptLength: prompt.length });
  }

  /** {@inheritdoc IExternalAgentAdapter.streamEvents} */
  async *streamEvents(_agentSessionId: string): AsyncIterable<ExternalAgentEvent> {
    this.assertProcessAlive();

    const rl = readline.createInterface({ input: this.process!.stdout! });

    for await (const line of rl) {
      if (!line.trim()) continue;
      let event: ExternalAgentEvent;
      try {
        event = JSON.parse(line) as ExternalAgentEvent;
      } catch {
        this.logger.warn('StdioAcpAdapter: malformed event line', { line });
        continue;
      }
      yield event;
      if (event.type === 'done' || event.type === 'error') {
        rl.close();
        return;
      }
    }
  }

  /** {@inheritdoc IExternalAgentAdapter.cancel} */
  async cancel(_agentSessionId: string): Promise<void> {
    if (this.process && this.process.exitCode === null) {
      this.logger.info('StdioAcpAdapter: sending SIGTERM', { agentId: this.agentId });
      this.process.kill('SIGTERM');
    }
  }

  /** {@inheritdoc IExternalAgentAdapter.close} */
  async close(_agentSessionId: string): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.logger.warn('StdioAcpAdapter: subprocess did not exit gracefully — sending SIGKILL', {
          agentId: this.agentId,
        });
        this.process?.kill('SIGKILL');
        resolve();
      }, 5_000);

      this.process!.once('exit', () => {
        clearTimeout(timeout);
        this.logger.info('StdioAcpAdapter: subprocess exited cleanly', { agentId: this.agentId });
        resolve();
      });

      // Close stdin to signal end-of-input to the subprocess
      this.process!.stdin?.end();
    });
  }

  /** {@inheritdoc IExternalAgentAdapter.healthCheck} */
  async healthCheck(): Promise<boolean> {
    return this.process !== null && this.process.exitCode === null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads a single newline-terminated line from the subprocess stdout.
   * Times out after 10 seconds to prevent blocking indefinitely on a hung subprocess.
   */
  private readLine(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new AppError({
            code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
            message: `StdioAcpAdapter: subprocess ${this.agentId} timed out during handshake`,
          }),
        );
      }, 10_000);

      let buffer = '';
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const idx = buffer.indexOf('\n');
        if (idx !== -1) {
          clearTimeout(timeout);
          this.process!.stdout!.off('data', onData);
          resolve(buffer.slice(0, idx));
        }
      };

      this.process!.stdout!.on('data', onData);
    });
  }

  /** Throws if the subprocess is not running. */
  private assertProcessAlive(): void {
    if (!this.process || this.process.exitCode !== null) {
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: `StdioAcpAdapter: subprocess for ${this.agentId} is not running`,
      });
    }
  }
}
