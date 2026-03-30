// Initialize OpenTelemetry FIRST (before any other imports)
import { initOtelSdk } from "./telemetry/sdk/otel.sdk";

const sdk = initOtelSdk({
  serviceName: process.env.OTEL_SERVICE_NAME || "search-api",
  serviceVersion: process.env.npm_package_version || "1.0.0",
  environment: process.env.NODE_ENV || "development",
  otlpEndpoint:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  enabled: process.env.OTEL_ENABLED !== "false",
  debugMode: process.env.NODE_ENV === "development",
});

import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

/**
 * Bootstrap the search-api NestJS application.
 *
 * Adapter:   Fastify (lower latency than Express for high-throughput read-only queries)
 * Logger:    nestjs-pino replaces the default NestJS logger for structured JSON output
 * Swagger:   OpenAPI docs at /api/docs (disabled in production)
 * Port:      8001 (configurable via PORT env var)
 */
async function bootstrap(): Promise<void> {
  // Use Fastify adapter for higher throughput compared to Express
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      // Suppress the built-in logger — nestjs-pino takes over after module init
      bufferLogs: true,
    },
  );

  // Replace NestJS default logger with the Pino-based structured logger
  app.useLogger(app.get(Logger));

  // Enable CORS — kms-api and the frontend may call this service directly in development
  await app.register(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@fastify/cors"),
    {
      // In production, restrict to kms-api origin via environment variable
      origin: process.env.CORS_ORIGIN ?? "*",
    },
  );

  // Swagger / OpenAPI documentation — enabled only outside production
  if (process.env.NODE_ENV !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("KMS Search API")
      .setDescription(
        "Read-only hybrid search service — BM25 (PostgreSQL FTS) + " +
          "semantic (Qdrant ANN) + RRF fusion. All endpoints require x-user-id header.",
      )
      .setVersion("1.0")
      .addApiKey(
        { type: "apiKey", name: "x-user-id", in: "header" },
        "x-user-id",
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    // Mount at /api/docs so it doesn't conflict with the /health and /search paths
    SwaggerModule.setup("api/docs", app, document);
  }

  // Bind to all interfaces (0.0.0.0) so the container is reachable from the host
  const port = parseInt(process.env.PORT ?? "8001", 10);
  await app.listen(port, "0.0.0.0");

  // Use the pino logger for the startup message so it appears in structured JSON logs
  const logger = app.get(Logger);
  logger.log(`search-api listening on port ${port}`, "Bootstrap");
  if (process.env.NODE_ENV !== "production") {
    logger.log(`Swagger docs: http://localhost:${port}/api/docs`, "Bootstrap");
  }
}

// Top-level await not available with CommonJS target — use .catch for unhandled rejections
bootstrap().catch((err) => {
  // Use console here because the Pino logger may not be initialised yet
  console.error("[search-api] Fatal startup error", err);
  process.exit(1);
});
