# Redis realtime state

Redis is the authoritative store for *ephemeral* multiplayer state when
`EPHEMERAL_STATE_MODE=redis`. PostgreSQL remains authoritative for durable
problems, submissions, score history, and analytics.

## Keys and ownership

- `${REDIS_KEY_PREFIX}:room:<encoded-room-code>` holds one bounded JSON room
  document: membership, connection state, the active problem, replay frames,
  current scores, and anti-cheat state. Every write refreshes its bounded TTL
  (`REDIS_ROOM_TTL_MS`). Node cleanup timers are deliberately not serialized.
- `${REDIS_KEY_PREFIX}:socket-rate-limit:<rule>:<encoded-identity>` is an
  atomic fixed-window counter. Redis owns its expiration.
- `${REDIS_KEY_PREFIX}:socket.io*` is owned by the Socket.IO Redis adapter for
  cross-instance broadcasts and request/response coordination.

All caller-derived portions of keys are encoded or validated. The repository
rejects unsafe, malformed, over-large, or prototype-polluting stored JSON.

## Running it safely

Set a private `REDIS_URL` and `EPHEMERAL_STATE_MODE=redis`. Redis mode connects
both Socket.IO pub/sub clients before the HTTP server starts; a failed initial
connection prevents startup. Production requires a `rediss://` endpoint, so
TLS is not optional there. Never log or commit a credential-bearing Redis URL.

The Redis rate limiter fails closed if Redis or its Lua script is unavailable.
This avoids turning an outage into an unbounded multi-instance socket path.

## Crash and recovery model

There is no process-local fallback while Redis mode is active. If a process
dies, another instance can continue a room from Redis. If Redis data is lost
or a room TTL expires, that in-progress room is intentionally treated as
ended: clients must create or join a new room, while already-recorded
submissions and their analytics remain in PostgreSQL. This is the explicit
reconciliation boundary; the service does not try to reconstruct a live match
from durable submission history.

The next room mutation refreshes the TTL. Redis persistence/replication and a
TTL longer than the maximum expected match are deployment responsibilities;
the application cannot recover data that Redis has already evicted or lost.
