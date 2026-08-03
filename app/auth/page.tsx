"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PremiumShell, SurfaceCard, TopNav } from "@/components/ui/PremiumShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { authClient } from "@/lib/auth-client";
import { apiRequest } from "@/lib/api";
import { socket } from "@/lib/socket";
import type { AuthUser } from "@/types/domain";

export default function AuthPage() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) router.replace("/profile");
  }, [router, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");

    try {
      if (mode === "register") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: displayName || email.split("@")[0],
        });

        if (res.error) {
          try {
            const legacyRes = await apiRequest<{ user?: AuthUser }>("/api/auth/register", {
              method: "POST",
              body: JSON.stringify({ email, password, displayName }),
            });
            if (legacyRes.user) {
              setUser(legacyRes.user);
              socket.disconnect().connect();
              router.replace("/");
              return;
            }
          } catch {
            // Ignore fallback
          }
          throw new Error(res.error.message || "Registration failed.");
        }

        if (res.data?.user) {
          setUser({
            id: res.data.user.id,
            email: res.data.user.email,
            username: (res.data.user as { username?: string }).username || res.data.user.name || res.data.user.email.split("@")[0],
            displayName: res.data.user.name || res.data.user.email,
            avatar: res.data.user.image ?? null,
            provider: "credentials",
            role: ((res.data.user as { role?: AuthUser["role"] }).role as AuthUser["role"]) || "user",
          });
        }
      } else {
        const res = await authClient.signIn.email({
          email,
          password,
        });

        if (res.error) {
          try {
            const legacyRes = await apiRequest<{ user?: AuthUser }>("/api/auth/login", {
              method: "POST",
              body: JSON.stringify({ email, password }),
            });
            if (legacyRes.user) {
              setUser(legacyRes.user);
              socket.disconnect().connect();
              router.replace("/");
              return;
            }
          } catch {
            // Ignore fallback
          }
          throw new Error(res.error.message || "Sign in failed.");
        }

        if (res.data?.user) {
          setUser({
            id: res.data.user.id,
            email: res.data.user.email,
            username: (res.data.user as { username?: string }).username || res.data.user.name || res.data.user.email.split("@")[0],
            displayName: res.data.user.name || res.data.user.email,
            avatar: res.data.user.image ?? null,
            provider: "credentials",
            role: ((res.data.user as { role?: AuthUser["role"] }).role as AuthUser["role"]) || "user",
          });
        }
      }

      socket.disconnect().connect();
      router.replace("/");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Authentication could not be completed.",
      );
    } finally {
      setPending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGooglePending(true);
    setError("");
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setGooglePending(false);
    }
  };

  return (
    <PremiumShell
      topbar={<TopNav eyebrow="Account Access" title="Sign in to compete" />}
    >
      <section className="auth-stage">
        <SurfaceCard className="auth-card">
          <div className="auth-heading">
            <div className="eyebrow">Better Auth</div>
            <h1>{mode === "login" ? "Welcome back." : "Create your arena account."}</h1>
            <p>
              Browsing and practice stay open to guests. Accounts are required
              for submissions, competitive rooms, saved progress, and authoring.
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "editor-tab active" : "editor-tab"}
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
            >
              sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "editor-tab active" : "editor-tab"}
              onClick={() => {
                setMode("register");
                setError("");
                setMessage("");
              }}
            >
              register
            </button>
          </div>

          <div className="google-auth-container" style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className="button"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#fff",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onClick={handleGoogleSignIn}
              disabled={googlePending || pending}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.13C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.6H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.4l4.01-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.27 6.6l4.01 3.13c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              {googlePending ? "connecting…" : "Continue with Google"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1rem 0", color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
            <span>or use email</span>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
          </div>

          <form className="stack auth-form" onSubmit={submit}>
            {mode === "register" && (
              <label className="stack">
                <span className="form-label">Display name</span>
                <input
                  className="input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value.slice(0, 80))}
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  required
                />
              </label>
            )}
            {message && <div className="form-message" role="status">{message}</div>}
            <label className="stack">
              <span className="form-label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value.slice(0, 254))}
                autoComplete="email"
                required
              />
            </label>
            <label className="stack">
              <span className="form-label">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value.slice(0, 1024))}
                minLength={12}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
              <span className="field-help">Use at least 12 characters.</span>
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary" type="submit" disabled={pending || googlePending}>
              {pending
                ? "working…"
                : mode === "login"
                ? "sign in"
                : "create account"}
            </button>
          </form>
        </SurfaceCard>
      </section>
    </PremiumShell>
  );
}
