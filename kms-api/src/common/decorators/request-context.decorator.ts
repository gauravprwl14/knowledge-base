import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { getTraceContext } from '../../telemetry';

/**
 * Request context interface
 */
export interface RequestContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  ip?: string;
  userAgent?: string;
  method: string;
  url: string;
  userId?: string;
}

/**
 * Request Context decorator for extracting request context information
 *
 * @example
 * ```typescript
 * @Post('audit')
 * createAudit(
 *   @Body() data: CreateAuditDto,
 *   @GetRequestContext() ctx: RequestContext,
 * ) {
 *   return this.auditService.create(data, ctx);
 * }
 * ```
 */
export const GetRequestContext = createParamDecorator(
  (data: keyof RequestContext | undefined, ctx: ExecutionContext): RequestContext | any => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const traceContext = getTraceContext();

    const context: RequestContext = {
      requestId: (request.headers['x-request-id'] as string) || (request as any).id,
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      method: request.method,
      url: request.url,
      userId: (request as any).user?.id,
    };

    return data ? context[data] : context;
  },
);
