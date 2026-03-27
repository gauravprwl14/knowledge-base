import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * HealthModule — provides liveness (`GET /health`) and readiness
 * (`GET /health/ready`) probes for the search-api.
 *
 * `PrismaModule` is global so it is automatically available to
 * {@link HealthController} without an explicit import here.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
