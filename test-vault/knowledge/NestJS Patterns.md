# NestJS Patterns

## Dependency Injection
Always use constructor injection. Never instantiate services manually.

## Repository Pattern
All DB access goes through repository classes. Services never call Prisma directly.

## Error Handling
Use `AppException` from `@kb/errors`. Never throw raw `HttpException`.
Include KB error codes: `KBAUT0001`, `KBFIL0001`, etc.

## PinoLogger
```typescript
@InjectPinoLogger(MyService.name)
private readonly logger: PinoLogger
```
Never use `new Logger()`.

## OpenTelemetry
Add `@Trace({ name: 'domain.method' })` to every service method that does I/O.
