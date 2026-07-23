# HANDOFF

## Files changed
- `components/ui/PremiumShell.tsx`
- `app/page.tsx`
- `app/game/[roomCode]/page.tsx`
- `app/globals.css`
- `next.config.ts`
- `HANDOFF.md`

## Completed work
- Inspected project routes, socket events, problem data, judge/executor support, and shared domain types before changing UI.
- Removed homepage dummy UI: fake stats, fake featured problems, fake activity, fake top players, and non-existent nav entries.
- Simplified primary shell navigation to only the verified `/` route.
- Reworked homepage into a real start/join control surface backed by existing socket events.
- Reworked game sidebar from fake analytics/runtime/memory/suggestions into real attempt bytes, par delta, local submission history, actual leaderboard updates, and anti-cheat summaries.
- Fixed opponent code display to handle the backend's real `code-update` payload object.
- Fixed React `NaN` children warning by handling the backend's real anti-cheat summary shape: `{ stats, events }`.
- Exposed all languages supported by the existing executor: Python, JavaScript, C++, Java.
- Replaced accumulated dashboard CSS with a smaller dark, terminal-inspired style system for existing home/lobby/game/replay screens.
- Pinned `turbopack.root` in `next.config.ts` after Next warned about parent lockfile root inference.
- Installed frontend and server dependencies from existing lockfiles so verification and local testing could run.
- Started local dev servers:
  - Frontend: `http://localhost:3000`
  - Socket backend: `http://localhost:3001`

## Backend endpoints/routes found
- Socket events used by frontend/backend:
  - `create-room`
  - `room-created`
  - `start-solo`
  - `join-room`
  - `rejoin-room`
  - `room-ready`
  - `room-error`
  - `get-problem`
  - `problem`
  - `code-update`
  - `submit-code`
  - `submission-result`
  - `leaderboard-update`
  - `get-replay`
  - `replay-data`
  - `anti-cheat-event`
  - `anti-cheat-warning`
  - `get-anti-cheat-summary`
  - `anti-cheat-summary`
- Verified app pages:
  - `/`
  - `/lobby/[roomCode]`
  - `/game/[roomCode]`
  - `/replay/[roomCode]`

## Unknown endpoints
- None intentionally used. No REST API routes were found in the frontend/server inspection.

## Bugs found/fixed
- Fixed frontend opponent-code handler: backend emits `{ playerId, code, language }`, but UI expected a raw string.
- Removed fake judge metrics (`42ms`, `18mb`, percentile, suggestions) that were not present in `submission-result`.
- Fixed anti-cheat summary handling: backend emits `{ stats, events }`, while the UI previously treated the entire payload as `Record<string, AntiCheatStats>`, causing `warningTotals` to become `NaN`.

## Assumptions
- "Auth, profile, problems, contests, submissions" in the prompt refer to desired preserved functionality broadly, but this repository currently only contains room/lobby/game/replay functionality with socket-based judging.
- Existing lobby/replay inline styles are functional and route-backed; they may be further cleaned up without feature changes.

## Files remaining
- Optional cleanup pass on `app/lobby/[roomCode]/page.tsx` and `app/replay/[roomCode]/page.tsx` to remove inline styles and align visual polish.
- Optional manual browser QA after local servers are running.

## Build/lint status
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run check:server`: passed.
- Smoke check:
  - `curl -I http://localhost:3000`: `200 OK`
  - `curl -I http://localhost:3001`: `404 Not Found`, expected for Express root because no REST route is defined.

## Exact next step
- Manual browser QA of create-room, join-room, solo practice, submit, leaderboard, and replay flows against the running local servers.
