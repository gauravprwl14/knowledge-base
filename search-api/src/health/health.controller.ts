import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";

/**
 * HealthController provides a lightweight liveness probe for orchestrators
 * (Docker, Kubernetes, load balancers) and the kms-api health aggregator.
 *
 * GET /health returns 200 with service metadata when the process is alive.
 * No dependency checks are performed — this is a liveness probe, not readiness.
 */
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  /**
   * Returns liveness status for the search-api service.
   *
   * @returns JSON object with status, service name, and mock-mode flags
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Liveness probe",
    description:
      "Returns 200 if the process is alive. Used by Docker healthcheck.",
  })
  @ApiResponse({
    status: 200,
    description: "Service is alive",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        service: { type: "string", example: "search-api" },
        version: { type: "string", example: "1.0.0" },
        mockBm25: { type: "boolean", example: true },
        mockSemantic: { type: "boolean", example: true },
        uptime: { type: "number", example: 42.5 },
      },
    },
  })
  health(): Record<string, unknown> {
    // Read mock-mode flags so operators can confirm the service configuration at a glance
    const mockBm25 = this.config.get<boolean>("MOCK_BM25") ?? true;
    const mockSemantic = this.config.get<boolean>("MOCK_SEMANTIC") ?? true;

    return {
      status: "ok",
      service: "search-api",
      version: "1.0.0",
      // Mock flags help operators confirm dev vs production mode without reading env vars
      mockBm25,
      mockSemantic,
      // Process uptime in seconds — useful for diagnosing recent restarts
      uptime: parseFloat(process.uptime().toFixed(2)),
    };
  }
}
