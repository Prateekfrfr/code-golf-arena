# Authentication setup

Code Golf Arena uses first-party email and password accounts. It does not call
Google, GitHub, Clerk, Auth.js, or another identity API. Passwords are hashed
with salted `scrypt`; sessions use opaque, rotating secrets in HttpOnly
cookies, and PostgreSQL stores only SHA-256 session digests.

## 1. Configure the environment

Copy `.env.example` to `.env.local` for Next.js and load the same values in the
server process:

```env
PERSISTENCE_MODE=postgres
DATABASE_URL=postgresql://codegolf:change-me@localhost:5432/codegolf
CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

AUTH_SESSION_COOKIE_NAME=cga_session
AUTH_SESSION_TTL_MS=604800000
AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com
```

`AUTH_BOOTSTRAP_ADMIN_EMAIL` is optional. When set, the first account
registered with that exact email receives the `admin` role. Remove the value
after creating the account. Never use it as a permanent authorization secret.

No OAuth client IDs, provider secrets, or external callback URLs are required.

## 2. Apply migrations and seed problems

Install dependencies, then run:

```bash
npm ci
npm --prefix server ci
npm run db:migrate
npm run db:seed
```

The seed command installs the bundled original catalog. It does not download
or scrape problem data.

## 3. Start the application

Run these in separate terminals:

```bash
npm run dev:server
npm run dev
```

Open `http://localhost:3000/auth`, register the bootstrap administrator, then
clear `AUTH_BOOTSTRAP_ADMIN_EMAIL`.

## Production deployment

- Serve both origins over HTTPS.
- Set `CORS_ORIGINS` to the exact frontend origin; do not use `*`.
- Use a private PostgreSQL network and a credential with access only to this
  database.
- Run migrations as a deployment step, never from application startup.
- Keep the session cookie name stable across releases.
- Put the execution worker on a separate host from the public web process.
- Configure Redis only when horizontally scaling realtime room state.

The server marks production cookies `Secure`, uses `SameSite=Lax`, rejects
cross-site state-changing requests through `Origin` and Fetch Metadata checks,
and rate-limits login and registration attempts.

## Roles

- `user` — submissions, contests, profile, and durable progress
- `problem_setter` — problem authoring and test management
- `moderator` — setter access plus future moderation tools
- `admin` — full authoring access and administrative bootstrap

Role checks are performed by the backend on every authoring request. Hiding a
navigation link is only a user-interface convenience.

## Troubleshooting

### Accounts return 503

Set `PERSISTENCE_MODE=postgres`, provide `DATABASE_URL`, and run migrations.
Guest browsing remains available when PostgreSQL accounts are disabled.

### The browser does not stay signed in

Confirm the frontend and backend use compatible hosts, such as `localhost` for
both rather than mixing `localhost` and `127.0.0.1`. Confirm
`CORS_ORIGINS` exactly matches the browser origin and both requests use HTTPS
in production.

### Registration says the email already exists

Email uniqueness is case-insensitive. Sign in with the existing account.

### The authoring desk says access is restricted

Use the bootstrap administrator account or update the account role to
`problem_setter`, `moderator`, or `admin` through an audited database
administration process.

### A session expired

Sign in again. The client can call `POST /api/auth/refresh` before expiry to
rotate an active session.

