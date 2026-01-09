import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * HealthModule provides health check endpoints for the application.
 *
 * Endpoints:
 * - GET /health - Comprehensive health check
 * - GET /health/ready - Readiness probe
 * - GET /health/live - Liveness probe
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator],
})
export class HealthModule {}
