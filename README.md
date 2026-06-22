# Code Golf Arena

A real-time multiplayer code golf arena where two players receive the same
problem, race to solve it with the fewest characters, watch each other's code
live, submit through Docker-isolated judging, and replay the match afterward.

## Current Stack

- Next.js App Router and TypeScript
- Socket.io client/server
- Express backend
- Monaco Editor
- Docker execution via dockerode
- In-memory repositories prepared for Redis migration

## Features

- Private room creation and joining
- Lobby with copyable room code
- Real-time code synchronization
- Monaco editor with Python, JavaScript, C++, and Java language selection
- Docker sandbox execution with memory limits, process limits, network disabled,
  and timeout enforcement
- Stdin/stdout problem judging
- Character-count scoring and live leaderboard
- Replay playback with side-by-side editors
- Anti-cheat telemetry for tab switches, large pastes, and submission spam
- Dark-first responsive UI for portfolio demos

## Getting Started

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
cd server
npm install
```

Start the backend:

```bash
cd server
npm start
```

Start the frontend in another terminal:

```bash
npm run dev
```

Open:

```bash
http://localhost:3000
```

Docker Desktop must be running before submissions can be judged.

## Architecture

```text
app/                    Next.js pages
data/                   Local problem set
lib/socket.js           Socket.io client singleton
server/index.js         Socket.io event boundary
server/executor.js      Docker sandbox runner
server/judge.js         Test-case judging
server/antiCheat.js     Anti-cheat event tracking
server/problemProviders Problem provider abstraction
server/repositories     In-memory room, replay, and score repositories
shared/events.js        Shared socket event names
types/domain.ts         Frontend domain types
```

## Verification

```bash
npm run lint
npm run build
cd server
npm run check
```

## Redis Migration Path

The current architecture already routes all game state mutations through repository modules, which makes the migration to Redis relatively straightforward. Instead of changing the Socket.io event handlers or game flow logic, the goal is to swap the existing in-memory repository implementations with Redis-backed versions that expose the same interfaces.

This approach keeps the networking layer stable while allowing state to be shared across multiple server instances, survive process restarts, and support horizontal scaling.

### Room Repository

The room repository would become the primary source of truth for active game sessions. It should manage:

* Room creation and deletion
* Player join/leave events
* Room status transitions (waiting, countdown, active, finished)
* Selected coding problem metadata
* Host information and room configuration
* Current player list and readiness state

Each room can be stored as a Redis hash, with supporting sets for player membership and room discovery. Room expiration can also be handled through Redis TTLs to automatically clean up abandoned sessions.

### Replay Repository

Currently, replay data exists only in memory for the lifetime of the match. Moving this to Redis enables replay persistence and post-game analysis.

The replay repository would store:

* Player frame updates
* Position snapshots
* Movement events
* Timing information required for replay reconstruction

Redis Streams are a good fit here because replay events are naturally append-only and ordered by time. This allows efficient storage while preserving the exact sequence of player actions.

### Score Repository

Score data is already isolated from the networking layer, making it a natural candidate for Redis Sorted Sets.

Responsibilities include:

* Maintaining live player rankings
* Fast leaderboard generation
* Final score calculation
* Ranking queries during and after a match

Using Sorted Sets allows score updates and ranking lookups to remain efficient even as room sizes increase.

### Anti-Cheat Repository

Anti-cheat state is currently transient and tied to a single server process. Redis would allow detection logic to remain consistent across distributed instances.

Data that could be stored includes:

* Suspicious event counters
* Rate-limit tracking
* Invalid movement detections
* Excessive input frequency metrics
* Historical violation records

Redis counters and expiration-based keys are particularly useful here, since most anti-cheat checks rely on tracking event frequency within rolling time windows.

### Migration Strategy

A low-risk migration path is to introduce Redis-backed repositories one at a time while preserving the existing repository interfaces. The Socket.io layer should not need significant changes because it already communicates exclusively through repository abstractions.

A possible rollout order would be:

1. Room repository
2. Score repository
3. Anti-cheat repository
4. Replay repository

This sequence moves the most critical shared state first while minimizing operational risk. Once all repositories are backed by Redis, multiple game server instances can safely operate against the same state store, enabling horizontal scaling without major changes to the application architecture.
