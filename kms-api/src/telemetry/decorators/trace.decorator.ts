import { trace, Span, SpanStatusCode, context } from '@opentelemetry/api';

/**
 * Options for the Trace decorator
 */
export interface TraceOptions {
  /** Custom name for the span (defaults to method name) */
  name?: string;
  /** Static attributes to add to the span */
  attributes?: Record<string, string | number | boolean>;
  /** Whether to record method arguments as attributes */
  recordArgs?: boolean;
  /** Whether to record return value as attribute */
  recordResult?: boolean;
  /** Skip tracing if condition is met */
  skipIf?: () => boolean;
}

/**
 * Trace decorator for automatically creating spans around methods
 *
 * @param options - Tracing options
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class UserService {
 *   @Trace()
 *   async findById(id: string): Promise<User> {
 *     return this.userRepository.findById(id);
 *   }
 *
 *   @Trace({ name: 'user.create', recordArgs: true })
 *   async create(data: CreateUserDto): Promise<User> {
 *     return this.userRepository.create(data);
 *   }
 *
 *   @Trace({
 *     attributes: { operation: 'bulk-delete' },
 *   })
 *   async deleteMany(ids: string[]): Promise<void> {
 *     await this.userRepository.deleteMany(ids);
 *   }
 * }
 * ```
 */
export function Trace(options: TraceOptions = {}): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = String(propertyKey);
    const spanName = options.name || `${className}.${methodName}`;

    descriptor.value = async function (...args: any[]) {
      // Check if tracing should be skipped
      if (options.skipIf?.()) {
        return originalMethod.apply(this, args);
      }

      const tracer = trace.getTracer('kms-api');

      return tracer.startActiveSpan(spanName, async (span: Span) => {
        try {
          // Add static attributes
          span.setAttribute('code.function', methodName);
          span.setAttribute('code.namespace', className);

          if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
              span.setAttribute(key, value);
            });
          }

          // Record arguments if requested
          if (options.recordArgs && args.length > 0) {
            args.forEach((arg, index) => {
              const argValue = typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
              span.setAttribute(`arg.${index}`, argValue.substring(0, 1000));
            });
          }

          // Execute the method
          const result = await originalMethod.apply(this, args);

          // Record result if requested
          if (options.recordResult && result !== undefined) {
            const resultValue =
              typeof result === 'object' ? JSON.stringify(result) : String(result);
            span.setAttribute('result', resultValue.substring(0, 1000));
          }

          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
          });

          if (error instanceof Error) {
            span.recordException(error);
            span.setAttribute('error.type', error.name);
            span.setAttribute('error.message', error.message);
          }

          throw error;
        } finally {
          span.end();
        }
      });
    };

    return descriptor;
  };
}

/**
 * Synchronous version of Trace decorator
 */
export function TraceSync(options: TraceOptions = {}): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = String(propertyKey);
    const spanName = options.name || `${className}.${methodName}`;

    descriptor.value = function (...args: any[]) {
      if (options.skipIf?.()) {
        return originalMethod.apply(this, args);
      }

      const tracer = trace.getTracer('kms-api');

      return tracer.startActiveSpan(spanName, (span: Span) => {
        try {
          span.setAttribute('code.function', methodName);
          span.setAttribute('code.namespace', className);

          if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
              span.setAttribute(key, value);
            });
          }

          if (options.recordArgs && args.length > 0) {
            args.forEach((arg, index) => {
              const argValue = typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
              span.setAttribute(`arg.${index}`, argValue.substring(0, 1000));
            });
          }

          const result = originalMethod.apply(this, args);

          if (options.recordResult && result !== undefined) {
            const resultValue =
              typeof result === 'object' ? JSON.stringify(result) : String(result);
            span.setAttribute('result', resultValue.substring(0, 1000));
          }

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
    };

    return descriptor;
  };
}

/**
 * Adds an attribute to the current span
 *
 * @example
 * ```typescript
 * async processOrder(orderId: string) {
 *   addSpanAttribute('order.id', orderId);
 *   // ... process order
 * }
 * ```
 */
export function addSpanAttribute(key: string, value: string | number | boolean): void {
  const span = trace.getSpan(context.active());
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Adds multiple attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getSpan(context.active());
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

/**
 * Records an exception on the current span
 */
export function recordSpanException(error: Error, message?: string): void {
  const span = trace.getSpan(context.active());
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: message || error.message,
    });
  }
}

/**
 * Adds an event to the current span
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  const span = trace.getSpan(context.active());
  if (span) {
    span.addEvent(name, attributes);
  }
}
