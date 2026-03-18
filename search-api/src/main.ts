/**
 * search-api Application Entry Point
 *
 * Bootstraps a read-only NestJS 11 + Fastify service that provides:
 *   - Keyword search  — PostgreSQL tsvector full-text search
 *   - Semantic search — Qdrant ANN with BGE-M3 1024-dim embeddings
 *   - Hybrid search   — Reciprocal Rank Fusion combining both
 *
 * OTel is initialised FIRST before any other import.
 */

// ── OpenTelemetry initialisation (must be line 1 of runtime execution) ─────
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const otelEnabled = process.env.OTEL_ENABLED !== 'false';

if (otelEnabled) {
  // OTel v2: Resource is now a type; use resourceFromAttributes() factory instead
  // OTel gRPC exporter: endpoint is set via OTEL_EXPORTER_OTLP_ENDPOINT env var
  // (the constructor config type no longer accepts a `url` property directly)
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: process.env.APP_NAME || 'search-api',
      [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}

// ── NestJS bootstrap ────────────────────────────────────────────────────────
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );

  // Use pino as the global NestJS logger
  app.useLogger(app.get(Logger));

  // Global API prefix
  const apiPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // Security / compression / CORS (Fastify plugins)
  await app.register(require('@fastify/helmet'));
  await app.register(require('@fastify/compress'));
  await app.register(require('@fastify/cors'), {
    origin: (process.env.CORS_ORIGINS || '*').split(',').map((o: string) => o.trim()),
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-user-id', 'X-Request-ID'],
  });

  // Swagger docs (non-production only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('search-api')
      .setDescription(
        'Read-only hybrid search service for the Knowledge Management System.\n\n' +
        'Provides keyword, semantic, and RRF-hybrid search over kms_files and kms_chunks.',
      )
      .setVersion('1.0')
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: 'x-user-id',
          description: 'Authenticated user UUID (injected by kms-api gateway)',
        },
        'x-user-id',
      )
      .addTag('Search', 'Hybrid knowledge-base search endpoints')
      .addTag('Health', 'Liveness and readiness probes')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
  }

  const port = parseInt(process.env.PORT || '8001', 10);
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    search-api  Started                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Port:         ${String(port).padEnd(46)}║
║  Prefix:       ${apiPrefix.padEnd(46)}║
║  Swagger:      ${(process.env.NODE_ENV === 'production' ? 'Disabled' : `http://localhost:${port}/docs`).padEnd(46)}║
║  OTel:         ${(otelEnabled ? 'Enabled' : 'Disabled').padEnd(46)}║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

bootstrap().catch((err) => {
  console.error('Failed to start search-api:', err);
  process.exit(1);
});
