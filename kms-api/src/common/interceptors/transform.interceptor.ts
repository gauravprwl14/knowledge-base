import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { getTraceContext } from '../../telemetry';

/**
 * Standard success response format
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
    requestId?: string;
    traceId?: string;
  };
  timestamp: string;
}

/**
 * Paginated response data (to be transformed)
 */
export interface PaginatedData<T = any> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Transform interceptor that wraps responses in a standard format
 *
 * Transforms all successful responses to:
 * ```json
 * {
 *   "success": true,
 *   "data": <response>,
 *   "meta": { "requestId": "...", "traceId": "..." },
 *   "timestamp": "2024-01-01T00:00:00.000Z"
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Global
 * app.useGlobalInterceptors(new TransformInterceptor());
 *
 * // Skip transformation for specific routes
 * @SkipTransform()
 * @Get('raw')
 * getRaw() {
 *   return { raw: true };
 * }
 * ```
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const traceContext = getTraceContext();

    // Get request ID
    const requestId = (request.headers['x-request-id'] as string) || undefined;

    return next.handle().pipe(
      map((data) => {
        // Check if data is already wrapped or should be skipped
        if (data && typeof data === 'object' && 'success' in data) {
          return data as unknown as SuccessResponse<T>;
        }

        // Build base meta
        const baseMeta: SuccessResponse['meta'] = {};

        if (requestId) {
          baseMeta.requestId = requestId;
        }
        if (traceContext.traceId) {
          baseMeta.traceId = traceContext.traceId;
        }

        // Handle paginated responses
        if (this.isPaginatedData(data)) {
          return {
            success: true,
            data: data.data,
            meta: {
              ...data.meta,
              ...baseMeta,
            },
            timestamp: new Date().toISOString(),
          } as SuccessResponse<T>;
        }

        // Standard response
        return {
          success: true,
          data,
          meta: Object.keys(baseMeta).length > 0 ? baseMeta : undefined,
          timestamp: new Date().toISOString(),
        } as SuccessResponse<T>;
      }),
    );
  }

  /**
   * Checks if data matches paginated response structure
   */
  private isPaginatedData(data: any): data is PaginatedData {
    return (
      data &&
      typeof data === 'object' &&
      Array.isArray(data.data) &&
      data.meta &&
      typeof data.meta.total === 'number' &&
      typeof data.meta.page === 'number'
    );
  }
}
