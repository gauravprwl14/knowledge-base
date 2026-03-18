import { Controller, Get, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

/**
 * HealthController — liveness and readiness probes for the search-api.
 *
 * All endpoints are public (no auth header required) and throttle-skipped
 * so that Kubernetes / Docker probes are never rate-limited.
 *
 * @example
 * ```http
 * GET /api/v1/health
 * → { status: 'ok', database: true, timestamp: '…' }
 * ```
 */
@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness probe — confirms the HTTP server is running.
   *
   * @returns `{ status: 'ok', timestamp }` — always 200 while the process is alive.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe — confirms the service is running' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is alive',
    schema: {
      example: {
        status: 'ok',
        service: 'search-api',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    },
  })
  liveness(): Record<string, unknown> {
    return {
      status: 'ok',
      service: 'search-api',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe — verifies the database connection is healthy.
   *
   * @returns `{ status, database, timestamp }` — `status: 'ok'` when ready.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — verifies database connectivity' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is ready to serve traffic',
    schema: {
      example: {
        status: 'ok',
        database: true,
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Database is not reachable',
  })
  async readiness(): Promise<Record<string, unknown>> {
    const dbHealthy = await this.prisma.isHealthy();
    return {
      status: dbHealthy ? 'ok' : 'degraded',
      database: dbHealthy,
      timestamp: new Date().toISOString(),
    };
  }
}
