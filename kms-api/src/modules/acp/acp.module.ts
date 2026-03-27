import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcpController } from './acp.controller';
import { AcpService } from './acp.service';
import { AcpSessionStore } from './acp-session.store';
import { AcpToolRegistry } from './acp-tool.registry';
import { AnthropicAdapter } from './external-agent/anthropic.adapter';
import { ExternalAgentAdapterFactory } from './external-agent/external-agent-adapter.factory';

/**
 * AcpModule wires the ACP gateway endpoints.
 *
 * CacheModule is @Global() so CacheService is available without explicit import.
 * ConfigModule is re-imported for ConfigService access in adapters.
 *
 * Sprint 4 additions:
 * - ExternalAgentAdapterFactory: creates transport adapters for external agents
 *   (StdioAcpAdapter for Claude Code/Codex, HttpAcpAdapter for Anthropic/OpenRouter)
 */
@Module({
  imports: [ConfigModule],
  controllers: [AcpController],
  providers: [
    AcpService,
    AcpSessionStore,
    AcpToolRegistry,
    AnthropicAdapter,
    ExternalAgentAdapterFactory,
  ],
  exports: [AcpService, ExternalAgentAdapterFactory],
})
export class AcpModule {}
