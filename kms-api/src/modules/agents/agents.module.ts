import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

/**
 * AgentsModule exposes ACP (Agent Communication Protocol) REST endpoints
 * that proxy to the `rag-service` Python FastAPI microservice (port 8002).
 *
 * Uses native `fetch` (Node 18+) for HTTP calls — `@nestjs/axios` is not a
 * declared dependency in this project.
 *
 * SSE streaming is handled via NestJS `@Sse()` decorator backed by an
 * RxJS `Observable<MessageEvent>`.
 */
@Module({
  imports: [ConfigModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
