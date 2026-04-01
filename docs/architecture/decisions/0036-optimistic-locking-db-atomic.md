# ADR-0036: ContentPiece Optimistic Locking Uses Atomic DB-Level WHERE Clause

**Status**: Accepted
**Date**: 2026-04-01
**Authors**: Gaurav (Ved)
**Deciders**: Engineering team

---

## Context

`ContentPiece` records are edited by users in the browser. To prevent lost
updates (Last-Write-Wins), the system uses **optimistic locking**: every
`ContentPiece` carries an integer `version` column that is incremented on every
write. A client update must supply the version it last read; if the DB version
has moved on, the request is rejected with HTTP 409.

### The bug: TOCTOU race window

The original implementation performed a **two-step read-then-check**:

```ts
// Step 1 — read
const piece = await prisma.contentPiece.findUnique({ where: { id } });
// -- race window begins here --
if (dto.version !== piece.version) throw conflictError;
// Step 2 — write
await prisma.contentPiece.update({ data: { version: piece.version + 1 } });
```

Between steps 1 and 2, a concurrent request can also read `version=1`, pass
the same check, and write `version=2`. When the original request then executes
its `update`, it silently overwrites the concurrent write — producing a
**lost update** even though optimistic locking was in place.

This is a classic **Time-Of-Check / Time-Of-Use (TOCTOU)** race condition.

---

## Decision

Replace the two-step read-then-check with a **single atomic `updateMany`** that
embeds the version check inside the SQL `WHERE` clause:

```ts
const result = await prisma.contentPiece.updateMany({
  where: {
    id: pieceId,
    job: { userId },     // IDOR guard at DB level
    version: dto.version // stale version => 0 rows matched
  },
  data: {
    content: dto.content,
    version: { increment: 1 }, // Prisma atomic increment
    editedAt: new Date(),
  },
});
```

The database evaluates `id = ? AND job.userId = ? AND version = ?` **inside a
single statement**. Only one concurrent writer can match; the second gets
`count=0` immediately — there is no window between the check and the write.

### Conflict disambiguation

`updateMany` returns only `{ count: number }` — it does not distinguish between
"piece not found", "wrong user", and "stale version". When `count=0` we issue
one follow-up `findFirst` scoped to `(id, job.userId)`:

- `findFirst` returns `null` → piece is missing or belongs to another user → 404
- `findFirst` returns a row → piece exists, version was stale → 409 (KBCNT0013)

This extra read runs **only on the error path** (conflict or not-found), which
is rare compared to normal writes. The hot path (successful update) remains a
single DB round-trip for the write plus one for the return-fetch.

### New error code

`KBCNT0013 PIECE_VERSION_CONFLICT` (HTTP 409) was added to `CNT_ERROR_CODES`
in `kms-api/src/errors/error-codes/index.ts`. This replaces the previous
untyped `ConflictException` so the client can react programmatically to version
conflicts without parsing message strings.

---

## Consequences

### Positive

- **No race condition**: the version check is atomic with the write — two
  concurrent writers for the same piece can no longer both succeed.
- **IDOR also atomic**: ownership enforcement moves from application code into
  the same DB WHERE clause, eliminating a separate guard branch.
- **Typed error**: KBCNT0013 gives the client a stable code to detect conflicts
  and prompt the user to re-fetch.

### Negative / Trade-offs

- **Follow-up read on conflict**: a second DB query is needed on the error path
  to tell the client *why* the update failed. This is acceptable because
  conflicts are rare and the query is cheap (primary-key lookup by `id`).
- **No row returned from `updateMany`**: Prisma's `updateMany` does not return
  the updated record, so a `findUniqueOrThrow` is still needed on the happy
  path. This is a limitation of the Prisma API, not of the approach.

---

## Alternatives Rejected

### `$transaction` with `SELECT FOR UPDATE`

Wrap the read-check-write in an interactive transaction with a pessimistic lock:

```ts
await prisma.$transaction(async (tx) => {
  const piece = await tx.$queryRaw`SELECT ... FOR UPDATE WHERE id = ${pieceId}`;
  if (piece.version !== dto.version) throw conflictError;
  await tx.contentPiece.update(...);
});
```

**Rejected because**:
- Requires raw SQL (`$queryRaw`) — breaks the Prisma type-safe layer.
- Holds a row-level lock for the duration of application code execution,
  increasing the chance of lock contention and deadlock under load.
- More complex to test correctly (transaction isolation behaviour is hard to
  mock in unit tests).
- The atomic `WHERE` approach achieves the same correctness guarantee with
  simpler, fully type-safe code and no lock overhead.

### Prisma `$transaction` with optimistic retry

Retry the transaction on version mismatch automatically. Rejected because it
hides the conflict from the client (who should decide whether to re-fetch and
retry, not the server), and adds unnecessary complexity.

---

## References

- Prisma `updateMany` docs: https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#updatemany
- TOCTOU race conditions: https://cwe.mitre.org/data/definitions/367.html
- Related error code: `KBCNT0013` in `kms-api/src/errors/error-codes/index.ts`
- Implementation: `kms-api/src/modules/content/content-pieces.service.ts` — `updatePiece()`
