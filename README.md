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
server/db/                   PostgreSQL pool, repositories, and reversible migrations
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

## PostgreSQL persistence

The server defaults to `PERSISTENCE_MODE=memory`, preserving the fast local
and test setup. Set `PERSISTENCE_MODE=postgres` and configure `DATABASE_URL`
to make the existing problem-provider and submission-repository seams use
PostgreSQL. Migrations are explicit and are never run during server boot:

```bash
npm run db:migrate
npm run db:seed
```

`db:seed` imports the bundled development catalog and, when configured,
bounded JSON files from `PROBLEM_SEED_FILESYSTEM_DIR`. It refuses to run until
the `PROBLEM_SEED_SOURCE_*` values identify an approved license, attribution,
and immutable source revision. Do not invent this provenance; set it to the
actual redistribution terms for the data being seeded.

To exercise reversible migrations against an empty disposable database:

```bash
npm run db:migrate:verify
```

The migration check applies all migrations, rolls them back, then applies them
again. It is intentionally an operator/CI integration check because it needs a
real `DATABASE_URL`.

## Alfa metadata ingestion

Alfa is an optional, self-hosted upstream adapter. It is disabled until both
`ALFA_API_URL` and `PROBLEM_SYNC_ENABLED=true` are configured. Its cache lives
in PostgreSQL and the admin sync routes require an authenticated administrator.

Every Alfa record is stored as `RESTRICTED_METADATA_ONLY`: public responses
contain attribution and the canonical LeetCode link, never a statement, HTML,
tests, or a judge bundle. `ALFA_STORE_FULL_CONTENT=false` is the safe default;
setting it to `true` is documented for local development only and does not make
the record public or judgeable.

## Accounts and durable progress

With `PERSISTENCE_MODE=postgres`, the backend provides registration, login,
logout, and profile endpoints under `/api/auth`. Passwords use salted `scrypt`;
the browser receives only an opaque, HttpOnly session cookie whose SHA-256
digest is stored in PostgreSQL. Cookies are `Secure` in production and use
`SameSite=Lax`; state-changing API requests reject cross-site origins.

Registration may include the browser's existing stable guest ID, transferring
that guest's durable submissions in one transaction. Existing browser sockets
then adopt the registered identity on reconnect. Persistent leaderboards are
available under `/api/leaderboards/{global,problems/:slug,languages/:language,me}`;
authenticated progress is at `/api/progress`, and `solved=solved|unsolved`
extends the existing `/api/problems` filters for an authenticated account.

Set `AUTH_BOOTSTRAP_ADMIN_EMAIL` only during initial setup if the first
matching registered account should administer problem sync. Clear it after the
administrator has registered. See [account security and setup](docs/AUTHENTICATION.md).

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

## Persistence roadmap

Problems, immutable problem versions, guest users, submissions, stored score
breakdowns, and analytics have PostgreSQL repositories today. Room, replay,
live score, and rate-limit state remain bounded in-memory adapters until the
Redis lifecycle phase. A production deployment should next use:

- Redis for room membership, TTLs, live scores, anti-cheat session state,
  replay streams, rate limits, and the Socket.IO adapter
- PostgreSQL for score configurations and source sync runs in addition to the
  durable entities above
- a dedicated execution worker/queue separated from the public Socket.IO
  process
- authenticated user sessions in place of the current random guest identity

The room lifecycle repository already has an asynchronous contract for create,
lookup, membership, connection, cleanup, and deletion. Its current in-memory
implementation preserves existing behavior; Redis will be a second
implementation rather than a new lifecycle path.

## Redis realtime state

Set `EPHEMERAL_STATE_MODE=redis` with a private `REDIS_URL` to share room
state, Socket.IO broadcasts, replay buffers, live scores, anti-cheat state,
and rate-limit counters across application instances. Redis keys are prefixed
with `REDIS_KEY_PREFIX` and use bounded TTLs; PostgreSQL remains authoritative
for durable problems, submissions, scores, and analytics. If Redis is
unavailable at startup, Redis mode refuses to boot rather than silently
splitting a live match across process-local state. In-memory mode remains the
default for development and tests. See [the Redis state and recovery
model](docs/REDIS_STATE.md) before using Redis in production.
