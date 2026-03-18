import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcpController } from './acp.controller';
import { AcpService } from './acp.service';
import { AcpSessionStore } from './acp-session.store';
import { AcpToolRegistry } from './acp-tool.registry';
import { AnthropicAdapter } from './external-agent/anthropic.adapter';

/**
 * AcpModule wires the ACP gateway endpoints.
 *
 * CacheModule is @Global() so CacheService is available without explicit import.
 * ConfigModule is re-imported for ConfigService access in adapters.
 */
@Module({
  imports: [ConfigModule],
  controllers: [AcpController],
  providers: [AcpService, AcpSessionStore, AcpToolRegistry, AnthropicAdapter],
  exports: [AcpService],
})
export class AcpModule {}
