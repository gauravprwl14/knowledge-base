import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/**
 * Timeout interceptor that limits request processing time
 *
 * Throws RequestTimeoutException if request takes longer than specified timeout.
 *
 * @example
 * ```typescript
 * // Global with default timeout (30s)
 * app.useGlobalInterceptors(new TimeoutInterceptor());
 *
 * // Controller with custom timeout
 * @UseInterceptors(new TimeoutInterceptor(60000))
 * @Controller('reports')
 * export class ReportsController {}
 *
 * // Method-level custom timeout
 * @Timeout(120000)
 * @Get('large-report')
 * getLargeReport() {}
 * ```
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number = 30000) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error) => {
        if (error instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                `Request timeout after ${this.timeoutMs}ms`,
              ),
          );
        }
        return throwError(() => error);
      }),
    );
  }
}
