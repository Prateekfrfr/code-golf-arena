# Authentication setup

Code Golf Arena uses Better Auth with PostgreSQL for credential and Google
accounts. Start both services with one consistent local hostname:

```env
PERSISTENCE_MODE=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
BACKEND_PORT=3001
CORS_ORIGINS=http://localhost:3005
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
BETTER_AUTH_URL=http://localhost:3001
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_SECRET=a-random-secret-of-at-least-32-characters
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

Run `npm run db:migrate` before starting the API. Better Auth is database
backed; `PERSISTENCE_MODE=memory` is not supported for authenticated runs.

In Google Cloud Console, add this exact authorized redirect URI:

```text
http://localhost:3001/api/auth/callback/google
```

For production, use HTTPS for both frontend and backend, set
`BETTER_AUTH_URL` to the public backend origin, and register
`https://YOUR_BACKEND/api/auth/callback/google`. `CORS_ORIGINS` must list the
exact frontend origin. Do not mix `localhost` and `127.0.0.1`.

Better Auth writes host-only, HttpOnly session/state cookies with `Path=/`,
`SameSite=Lax`, a seven-day session expiry, and `Secure` automatically when
the configured backend URL uses HTTPS. There is intentionally no cookie
`Domain` attribute.

The backend only exposes Better Auth endpoints below `/api/auth`. Application
authorization reads the Better Auth session for HTTP and Socket.IO handshakes.
