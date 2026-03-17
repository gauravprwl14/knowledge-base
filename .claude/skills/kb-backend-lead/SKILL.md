---
name: kb-backend-lead
description: NestJS module architecture, TypeORM patterns, service implementation for kms-api
argument-hint: "<implementation-task>"
---

# KMS Backend Lead

You implement NestJS modules for kms-api (port 8000). Apply consistent patterns across every module.

## Standard Module Structure

```
src/modules/{domain}/
  {domain}.module.ts          # imports, providers, exports
  {domain}.controller.ts      # HTTP handlers, guards, decorators
  {domain}.service.ts         # business logic
  {domain}.repository.ts      # TypeORM queries
  dto/
    create-{domain}.dto.ts
    update-{domain}.dto.ts
    {domain}-response.dto.ts
  entities/
    {domain}.entity.ts
  {domain}.module.spec.ts
```

## TypeORM Entity Pattern

```typescript
@Entity('kms_{domain}s')
export class DomainEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;                          // cross-domain: no FK, UUID only

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

## Service Pattern

```typescript
@Injectable()
export class DomainService {
  constructor(
    private readonly repo: DomainRepository,
    private readonly logger: Logger,
  ) {}

  async findById(id: string, userId: string): Promise<DomainEntity> {
    const entity = await this.repo.findOne({ where: { id, userId } });
    if (!entity) throw new NotFoundException(ErrorCodes.KMS_1001);
    return entity;
  }
}
```

## Error Code Format

Format: `PREFIX_NNNN` where prefix matches domain.

| Prefix | Domain |
|---|---|
| AUTH | Authentication / authorization |
| KMS | Core knowledge base |
| SEARCH | Search service |
| VOICE | Voice/transcription |
| EMBED | Embedding workers |

Example: `KMS_1001` = "File not found", `AUTH_1001` = "Invalid API key".

## Mandatory Patterns

Every service must include:

1. **Structured logging** — use NestJS `Logger`, include `userId` and `requestId` in every log
2. **OpenTelemetry** — wrap service methods with `tracer.startActiveSpan()` for external calls
3. **Multi-tenant isolation** — every repository query must filter by `userId`
4. **Input validation** — all DTOs use `class-validator` decorators
5. **Pagination** — cursor-based for lists (no offset for large tables)

## DI Resolution Checklist

When a module fails to initialize:
- [ ] Is the repository provided in the module's `providers` array?
- [ ] Is TypeORM `forFeature([Entity])` imported in the module?
- [ ] Are all injected services exported from their source module?
- [ ] Is the module imported in `AppModule` or a parent module?

## Quality Gates Before Marking Done

- [ ] Unit test for service methods (happy path + not-found + validation error)
- [ ] DTO validation tested
- [ ] Multi-tenant filter present in all queries
- [ ] Error codes use defined constants, not raw strings
- [ ] Logger calls include structured context object
