# ADR 0001: PostgreSQL query layer

## Status

Accepted.

## Context

The server is JavaScript ESM and has no existing ORM or query layer. The first
persistence phase needs explicit, reviewable migrations and repository
boundaries while preserving the in-memory implementations used by local tests.

## Decision

Use `pg` with parameterized SQL inside repository modules. The migration runner
executes versioned, paired `*.up.sql` and `*.down.sql` files; it never performs
schema synchronization at application boot. Pool creation, migration execution,
and repository composition remain separate from HTTP and Socket.IO handlers.

## Consequences

- SQL remains explicit and index-aware, which suits the current JavaScript ESM
  architecture and avoids adding a generated ORM layer.
- Every dynamic value is passed as a query parameter; identifiers are fixed
  application text.
- Repository contracts remain injectable and can be faked by Node tests.
- Schema evolution is reviewed through forward and reversible migration files.
