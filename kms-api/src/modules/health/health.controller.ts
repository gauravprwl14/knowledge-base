import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Health Controller
 *
 * Provides health check endpoints for monitoring and orchestration:
 * - GET /health - Liveness probe (is the app running?)
 * - GET /health/ready - Readiness probe (is the app ready to serve traffic?)
 * - GET /health/live - Simple liveness check
 *
 * @example
 * Kubernetes liveness probe:
 * ```yaml
 * livenessProbe:
 *   httpGet:
 *     path: /health/live
 *     port: 8000
 *   initialDelaySeconds: 10
 *   periodSeconds: 30
 *
 * readinessProbe:
 *   httpGet:
 *     path: /health/ready
 *     port: 8000
 *   initialDelaySeconds: 5
 *   periodSeconds: 10
 * ```
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Comprehensive health check
   */
  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Comprehensive health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Database check
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }

  /**
   * Readiness probe - checks if app is ready to serve traffic
   */
  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }

  /**
   * Liveness probe - simple check if app is running
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
