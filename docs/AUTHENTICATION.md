# Authentication and durable identity

Better Auth is the sole authentication authority. Its Express handler owns
`/api/auth/*`, including email/password, Google OAuth, session retrieval, and
sign-out. PostgreSQL persists users, accounts, sessions, and OAuth
verifications; HTTP routes and Socket.IO handshakes derive identity from the
same Better Auth session cookie.

Roles remain columns on `users` and are enforced by backend authorization on
every protected operation. Google is a trusted provider for same-email account
linking only when Google reports that email as verified.

The browser client uses `NEXT_PUBLIC_BETTER_AUTH_URL`, includes credentials on
every request, and reacts to Better Auth's session updates without requiring a
manual reload. OAuth callback URLs are always absolute frontend URLs so a
successful callback cannot resolve against the API origin.
