# Code Golf Arena

Code Golf Arena is a real-time multiplayer code-golf platform built with
Next.js, Socket.IO, Monaco, and Docker. Players can create private rooms, join
with a room code, race on the same problem, watch an opponent's code update,
submit to an isolated judge, compare deterministic scores, and replay the round.

## Product capabilities

- Multiplayer rooms and solo practice with reconnect-safe guest identity
- Python, JavaScript, C++, and Java execution
- Docker isolation with disabled networking, non-root execution, read-only
  root filesystems, dropped capabilities, process/CPU/memory/output limits, and
  a bounded concurrency queue
- Versioned fixed-point scoring using UTF-8 bytes and runtime
- Stored score breakdowns, immutable per-room attempts, percentiles, personal
  and room bests, trends, timelines, and language rankings
- Pluggable compression analyzers with safe golfing suggestions per language
- Extensible anti-cheat rules for focus duration, paste/drop attempts, and
  submission rate, including warning, final-warning, and invalidation states
- Provider-backed problem discovery with search, filters, and pagination
- Public/judge problem projections that never expose hidden tests
- Filesystem, GitHub, database, and local problem-provider adapters
- Validated import planning with fingerprints, duplicate detection, immutable
  versions, dry runs, archival, and SPDX license policy
- Responsive, accessible dark product UI with skeleton, error, and empty states

## Architecture

```text
app/                         Next.js App Router product surfaces
components/                  Shared application shell and UI primitives
hooks/                       Socket connection and transient-state hooks
lib/socket.js                Reconnect-safe Socket.IO client
data/problems.js             Small bundled development catalog
server/index.js              Socket and HTTP boundaries
server/executor.js           Hardened Docker execution adapter
server/judge.js              Structured multi-test judge
server/scoring/              Versioned deterministic score engine
server/analytics/            Submission analytics builder
server/compression/          Pluggable language analyzers
server/antiCheat/            Rule engine and session state
server/problemProviders/     Local, filesystem, GitHub, and DB adapters
server/problemImport/        Validation, dedupe, versioning, and sync planning
server/problems/             Canonical schema, catalog, public projections
server/repositories/         Current in-memory room/replay/score/submission state
shared/events.*              Shared event names
types/domain.ts              Frontend domain contracts
```

Socket.IO remains the live room transport. Cacheable discovery reads are served
from `GET /api/problems`. The backend has explicit repository seams so Redis
and PostgreSQL adapters can replace in-memory state without changing the UI
contract.

## Local setup

Requirements:

- Node.js 20.9 through 24
- npm 10
- Docker Desktop with the Docker Engine pipe available

Install and configure:

```bash
npm ci
npm --prefix server ci
copy .env.example .env.local
```

Run the backend and frontend in separate terminals:

```bash
npm run dev:server
npm run dev
```

Open `http://localhost:3000`. The backend listens on
`http://localhost:3001` by default.

The executor downloads configured language images on first use. Production
deployments should replace image tags in `.env.example` with reviewed immutable
digests and run the executor on a dedicated worker host.

## Scoring

`code-golf-v1` produces a higher-is-better integer score from 0 to 1,000,000:

- UTF-8 byte count: 80%
- total judge runtime: 20%

Each component is clamped to a configured range, normalized with integer
fixed-point arithmetic, and weighted in basis points. Every submission stores
the score, raw metrics, component contributions, and configuration version.
Future memory, compression, token-count, or complexity components can be added
through `createScoreConfig` without changing the ranking service.

## Problem providers and imports

The bundled catalog contains 15 development problems. It intentionally does not
bundle a scraped or license-unclear 200+ problem dataset.

Provider interfaces support:

- local in-process records
- bounded JSON files under an approved filesystem root
- allowlisted GitHub owners at a pinned full commit SHA
- an injected database repository

Import infrastructure validates the canonical schema, normalizes records,
computes SHA-256 fingerprints, detects duplicates, plans immutable versions,
supports dry-run and archive-on-removal behavior, and validates license and
attribution metadata before writes.

See [Problem sources and licensing](docs/PROBLEM_SOURCES.md) before connecting an
external repository.

## Verification

```bash
npm run problems:validate
npm run test
npm run lint
npm run typecheck
npm run check:server
npm run build
```

`npm run check` runs the full sequence.

## Production persistence path

Room, replay, score, and submission repositories are currently bounded
in-memory adapters for local demos. A production deployment should use:

- Redis for room membership, TTLs, live scores, anti-cheat session state,
  replay streams, rate limits, and the Socket.IO adapter
- PostgreSQL for users, problem versions, test cases, immutable submissions,
  score configurations, source sync runs, and durable analytics
- a dedicated execution worker/queue separated from the public Socket.IO
  process
- authenticated user sessions in place of the current random guest identity

The current repository interfaces and immutable submission/score payloads are
designed for that migration.
