import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  trace,
  context,
  Span,
  SpanStatusCode,
} from '@opentelemetry/api';

/**
 * OpenTelemetry SDK configuration options
 */
export interface OtelSdkConfig {
  serviceName: string;
  serviceVersion?: string;
  environment: string;
  otlpEndpoint: string;
  enabled?: boolean;
  debugMode?: boolean;
}

let sdk: NodeSDK | null = null;

/**
 * Initializes the OpenTelemetry SDK
 * Must be called before importing other modules
 *
 * @param config - OTel configuration options
 * @returns The initialized SDK instance or null if disabled
 *
 * @example
 * ```typescript
 * // In src/main.ts (before other imports)
 * import { initOtelSdk } from './telemetry/sdk/otel.sdk';
 *
 * const sdk = initOtelSdk({
 *   serviceName: 'kms-api',
 *   environment: 'development',
 *   otlpEndpoint: 'http://localhost:4317',
 * });
 * ```
 */
export function initOtelSdk(config: OtelSdkConfig): NodeSDK | null {
  if (config.enabled === false) {
    console.log('[OTel] OpenTelemetry is disabled');
    return null;
  }

  // Enable diagnostic logging in debug mode
  if (config.debugMode) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // Create resource with service information
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion || '1.0.0',
    [ATTR_DEPLOYMENT_ENVIRONMENT]: config.environment,
  });

  // Create trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: config.otlpEndpoint,
  });

  // Create metric exporter with periodic export
  const metricExporter = new OTLPMetricExporter({
    url: config.otlpEndpoint,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000, // Export every 60 seconds
  });

  // Initialize SDK with auto-instrumentations
  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            // Ignore health check endpoints
            const url = req.url || '';
            return url.includes('/health') || url.includes('/ready');
          },
        },
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable filesystem instrumentation (too noisy)
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();
  console.log(`[OTel] OpenTelemetry SDK initialized for ${config.serviceName}`);

  return sdk;
}

/**
 * Shuts down the OpenTelemetry SDK gracefully
 */
export async function shutdownOtelSdk(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log('[OTel] OpenTelemetry SDK shut down successfully');
    } catch (error) {
      console.error('[OTel] Error shutting down OpenTelemetry SDK:', error);
    }
  }
}

/**
 * Gets the current active span
 */
export function getActiveSpan(): Span | undefined {
  return trace.getSpan(context.active());
}

/**
 * Gets the current trace context
 */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  const span = getActiveSpan();
  if (!span) return {};

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

/**
 * Creates a new span and executes a function within it
 *
 * @example
 * ```typescript
 * const result = await withSpan('processOrder', async (span) => {
 *   span.setAttribute('orderId', orderId);
 *   return await processOrder(orderId);
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = trace.getTracer('kms-api');

  return tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });
      }

      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Synchronous version of withSpan
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  attributes?: Record<string, string | number | boolean>,
): T {
  const tracer = trace.getTracer('kms-api');

  return tracer.startActiveSpan(name, (span) => {
    try {
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });
      }

      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

export { sdk };
