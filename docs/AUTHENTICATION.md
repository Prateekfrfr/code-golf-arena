# Authentication and durable identity

Accounts require `PERSISTENCE_MODE=postgres` and migrations
`003_authentication` plus `004_local_auth_and_authoring`. The service keeps guest access for local development and
for new visitors, while registered accounts use durable `users.id` values.

## Session design

Authentication is local-only and does not depend on an OAuth or identity API.
Passwords are salted with Node's `scrypt`; plaintext credentials never reach
logs or database session records. Login and registration issue a 32-byte
opaque base64url secret in an HttpOnly, SameSite=Lax cookie. PostgreSQL stores
only its SHA-256 digest, expiry, revocation time, and owning user. Production
cookies are marked `Secure`.

The API validates configured Origins and Fetch Metadata for state-changing
requests. Socket.IO handshakes use the same cookie, while an invalid or expired
cookie falls back to the existing guest identity rather than trusting a client
supplied account ID.

## Guest claim and administrator bootstrap

On registration, the optional browser guest ID is treated as a one-time bearer
proof. In one transaction the server locks the registered and guest records,
creates an idempotent claim, and moves that guest's submissions to the account.
The registered account then owns its prior progress and personal leaderboard.

`AUTH_BOOTSTRAP_ADMIN_EMAIL` is optional. If present, only the matching first
registration receives the durable `admin` role. Set it before the first
registration, then remove it. Admin problem authoring is authorized by
that role, not by a static bearer token.

## API surface

- `POST /api/auth/register` — `email`, `password`, `displayName`, optional `guestId`
- `POST /api/auth/login` — `email`, `password`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET` / `PATCH /api/auth/me`
- `GET /api/leaderboards/global`
- `GET /api/leaderboards/problems/:slug`
- `GET /api/leaderboards/languages/:language`
- `GET /api/leaderboards/me` and `GET /api/progress` (authenticated)

Use `solved=solved` or `solved=unsolved` with the existing problem list/search
routes while authenticated. All pagination and leaderboard filter values are
validated and passed to PostgreSQL as parameters.

See the beginner-oriented [authentication setup guide](../AUTH_SETUP.md).
