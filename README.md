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

The server already routes state writes through repository modules. Replace the
in-memory repository implementations with Redis-backed equivalents while
keeping the Socket.io event layer mostly unchanged.

Suggested future stores:

- Room repository: room lifecycle, players, status, selected problem
- Replay repository: append-only player frame streams
- Score repository: sorted scores per room
- Anti-cheat repository: counters and event timeline per player
