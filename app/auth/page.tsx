"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PremiumShell, SurfaceCard, TopNav } from "@/components/ui/PremiumShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest } from "@/lib/api";
import { getGuestId, socket } from "@/lib/socket";
import type { AuthUser } from "@/types/domain";

export default function AuthPage() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) router.replace("/profile");
  }, [router, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await apiRequest<{ user: AuthUser }>(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(
            mode === "register"
              ? {
                  email,
                  password,
                  displayName,
                  guestId: getGuestId(),
                }
              : { email, password },
          ),
        },
      );
      setUser(result.user);
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

  return (
    <PremiumShell
      topbar={<TopNav eyebrow="Local account" title="Sign in to compete" />}
    >
      <section className="auth-stage">
        <SurfaceCard className="auth-card">
          <div className="auth-heading">
            <div className="eyebrow">first-party authentication</div>
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
              }}
            >
              register
            </button>
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
            <button className="button button-primary" type="submit" disabled={pending}>
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

