/**
 * KMS API Application Entry Point
 *
 * This file bootstraps the NestJS application with:
 * - OpenTelemetry SDK initialization
 * - Swagger documentation
 * - Global configuration
 * - Process signal handlers
 */

// Initialize OpenTelemetry FIRST (before any other imports)
import { initOtelSdk } from './telemetry/sdk/otel.sdk';

const sdk = initOtelSdk({
  serviceName: process.env.APP_NAME || 'kms-api',
  serviceVersion: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
  enabled: process.env.OTEL_ENABLED !== 'false',
  debugMode: process.env.NODE_ENV === 'development',
});

// Now import everything else
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { globalLogger } from './logger/logger.service';
import { setupProcessHandlers } from './bootstrap/process-handlers';

/**
 * Bootstrap the NestJS application
 */
async function bootstrap() {
  const logger = globalLogger.child({ context: 'Bootstrap' });

  try {
    logger.info('Starting KMS API...');

    // Create NestJS application with Fastify adapter
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({ logger: false }),
      {
        logger: globalLogger,
        bufferLogs: true,
      },
    );

    // Get config service
    const config = app.get(AppConfigService);

    // Set global prefix
    const apiPrefix = `${config.app.apiPrefix}/${config.app.apiVersion}`;
    app.setGlobalPrefix(apiPrefix);

    // Security and compression plugins (Fastify)
    await app.register(require('@fastify/helmet'));
    await app.register(require('@fastify/compress'));

    // CORS configuration
    await app.register(require('@fastify/cors'), {
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-API-Key',
        'X-Request-ID',
      ],
    });

    // Swagger documentation (development/staging only)
    if (!config.isProduction) {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('KMS API')
        .setDescription('Knowledge Management System API')
        .setVersion('1.0')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter JWT access token',
          },
          'jwt',
        )
        .addApiKey(
          {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
            description: 'Enter API key',
          },
          'api-key',
        )
        .addTag('Authentication', 'User authentication endpoints')
        .addTag('Health', 'Health check endpoints')
        .build();

      const document = SwaggerModule.createDocument(app, swaggerConfig);
      SwaggerModule.setup('docs', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
          docExpansion: 'none',
          filter: true,
          showRequestDuration: true,
        },
      });

      logger.info(`Swagger documentation available at /docs`);
    }

    // Setup process handlers (graceful shutdown, error handling)
    setupProcessHandlers({
      app,
      serviceName: config.app.name,
      shutdownTimeout: 10000,
    });

    // Start server
    await app.listen(config.app.port, config.app.host);

    logger.info(`KMS API started successfully`, {
      port: config.app.port,
      host: config.app.host,
      environment: config.app.nodeEnv,
      apiPrefix,
      swagger: config.isProduction ? 'disabled' : '/docs',
    });

    // Log startup info
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                        KMS API Started                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Environment:  ${config.app.nodeEnv.padEnd(46)}║
║  Port:         ${String(config.app.port).padEnd(46)}║
║  API Prefix:   ${apiPrefix.padEnd(46)}║
║  Swagger:      ${(config.isProduction ? 'Disabled' : `http://localhost:${config.app.port}/docs`).padEnd(46)}║
╚═══════════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    logger.fatal('Failed to start KMS API', { error });
    process.exit(1);
  }
}

// Start the application
bootstrap();
