import { metrics, Counter, Histogram, UpDownCounter, Attributes } from '@opentelemetry/api';

// Cache for metric instruments to avoid recreation
const metricCache = new Map<string, Counter | Histogram | UpDownCounter>();

/**
 * Gets or creates a counter metric
 */
function getCounter(name: string, description?: string): Counter {
  const key = `counter:${name}`;
  if (!metricCache.has(key)) {
    const meter = metrics.getMeter('kms-api');
    metricCache.set(key, meter.createCounter(name, { description }));
  }
  return metricCache.get(key) as Counter;
}

/**
 * Gets or creates a histogram metric
 */
function getHistogram(name: string, description?: string, unit?: string): Histogram {
  const key = `histogram:${name}`;
  if (!metricCache.has(key)) {
    const meter = metrics.getMeter('kms-api');
    metricCache.set(key, meter.createHistogram(name, { description, unit }));
  }
  return metricCache.get(key) as Histogram;
}

/**
 * Gets or creates an up-down counter metric
 */
function getUpDownCounter(name: string, description?: string): UpDownCounter {
  const key = `updown:${name}`;
  if (!metricCache.has(key)) {
    const meter = metrics.getMeter('kms-api');
    metricCache.set(key, meter.createUpDownCounter(name, { description }));
  }
  return metricCache.get(key) as UpDownCounter;
}

/**
 * Options for counter decorator
 */
export interface CounterOptions {
  /** Metric name (defaults to class.method.count) */
  name?: string;
  /** Metric description */
  description?: string;
  /** Static attributes */
  attributes?: Record<string, string>;
  /** Increment value (default 1) */
  increment?: number;
  /** Only count successful executions */
  onlyOnSuccess?: boolean;
}

/**
 * Counter decorator for incrementing a metric on method execution
 *
 * @example
 * ```typescript
 * class OrderService {
 *   @IncrementCounter({ name: 'orders.created' })
 *   async createOrder(data: CreateOrderDto) {
 *     // Creates a metric: orders.created
 *   }
 *
 *   @IncrementCounter({
 *     name: 'api.requests',
 *     attributes: { endpoint: '/users' },
 *   })
 *   async getUsers() {
 *     // ...
 *   }
 * }
 * ```
 */
export function IncrementCounter(options: CounterOptions = {}): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = String(propertyKey);
    const metricName = options.name || `${className}.${methodName}.count`;
    const increment = options.increment || 1;

    descriptor.value = async function (...args: any[]) {
      const counter = getCounter(metricName, options.description);
      const attributes: Attributes = {
        class: className,
        method: methodName,
        ...options.attributes,
      };

      try {
        const result = await originalMethod.apply(this, args);
        counter.add(increment, attributes);
        return result;
      } catch (error) {
        if (!options.onlyOnSuccess) {
          counter.add(increment, { ...attributes, success: false });
        }
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Options for timing decorator
 */
export interface TimingOptions {
  /** Metric name (defaults to class.method.duration) */
  name?: string;
  /** Metric description */
  description?: string;
  /** Time unit (defaults to 'ms') */
  unit?: string;
  /** Static attributes */
  attributes?: Record<string, string>;
  /** Histogram buckets (optional) */
  buckets?: number[];
}

/**
 * Timing decorator for recording method execution duration
 *
 * @example
 * ```typescript
 * class DatabaseService {
 *   @RecordDuration({ name: 'db.query.duration' })
 *   async executeQuery(sql: string) {
 *     // Records execution time as histogram
 *   }
 * }
 * ```
 */
export function RecordDuration(options: TimingOptions = {}): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = String(propertyKey);
    const metricName = options.name || `${className}.${methodName}.duration`;
    const unit = options.unit || 'ms';

    descriptor.value = async function (...args: any[]) {
      const histogram = getHistogram(metricName, options.description, unit);
      const startTime = performance.now();

      const attributes: Attributes = {
        class: className,
        method: methodName,
        ...options.attributes,
      };

      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - startTime;
        histogram.record(duration, { ...attributes, success: true });
        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        histogram.record(duration, { ...attributes, success: false });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Options for gauge decorator
 */
export interface GaugeOptions {
  /** Metric name */
  name: string;
  /** Metric description */
  description?: string;
  /** Static attributes */
  attributes?: Record<string, string>;
}

/**
 * Records a gauge value (up-down counter)
 *
 * @example
 * ```typescript
 * class ConnectionPool {
 *   private activeConnections = 0;
 *
 *   @RecordGauge({ name: 'pool.connections.active' })
 *   getActiveConnections(): number {
 *     return this.activeConnections;
 *   }
 * }
 * ```
 */
export function RecordGauge(options: GaugeOptions): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;

    descriptor.value = function (...args: any[]) {
      const result = originalMethod.apply(this, args);

      if (typeof result === 'number') {
        const gauge = getUpDownCounter(options.name, options.description);
        gauge.add(result, {
          class: className,
          ...options.attributes,
        });
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Manually increment a counter
 */
export function incrementCounter(
  name: string,
  value: number = 1,
  attributes?: Record<string, string>,
): void {
  const counter = getCounter(name);
  counter.add(value, attributes);
}

/**
 * Manually record a histogram value
 */
export function recordHistogram(
  name: string,
  value: number,
  attributes?: Record<string, string>,
): void {
  const histogram = getHistogram(name);
  histogram.record(value, attributes);
}

/**
 * Manually update a gauge
 */
export function updateGauge(
  name: string,
  value: number,
  attributes?: Record<string, string>,
): void {
  const gauge = getUpDownCounter(name);
  gauge.add(value, attributes);
}
