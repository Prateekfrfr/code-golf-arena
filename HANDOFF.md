# Code Golf Arena handoff

## Current state

The production-upgrade pass is implemented across the Next.js UI, Socket.IO
backend, Docker judge, scoring and analytics modules, anti-cheat system, problem
provider/import pipeline, and operational documentation.

Verification covers repository linting, TypeScript, 48 Node tests, server syntax
checks, problem-catalog validation, dependency audits, the Next.js production
build, HTTP health/discovery, and a Socket.IO room lifecycle smoke test.

## Important production boundaries

- Runtime room, replay, score, and submission repositories are still in memory.
  Replace them with PostgreSQL and Redis adapters before horizontal scaling.
- Guest identities are reconnect-stable but unauthenticated. Add account auth
  before public competitive events or durable profiles.
- The bundled catalog is intentionally small. Import a reviewed, licensed
  dataset through the provider/import pipeline to reach the target catalog size.
- Pin executor images to immutable registry digests in production.
- Run code execution on dedicated worker hosts with monitoring and deployment
  controls; do not colocate untrusted workloads with the web tier.

## Local commands

```bash
npm ci
npm --prefix server ci
npm run check
npm run problems:validate
npm run dev:server
npm run dev
```

See `README.md`, `.env.example`, and `docs/PROBLEM_SOURCES.md` for setup,
provider, licensing, and deployment guidance.
