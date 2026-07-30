"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageState, PremiumShell, SurfaceCard, TopNav } from "@/components/ui/PremiumShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest } from "@/lib/api";
import { socket } from "@/lib/socket";
import type { AuthUser } from "@/types/domain";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading, setUser, logout } = useAuth();
  const [displayNameDraft, setDisplayNameDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const displayName = displayNameDraft ?? user?.displayName ?? "";

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const result = await apiRequest<{ user: AuthUser }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      });
      setUser(result.user);
      setDisplayNameDraft(result.user.displayName);
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile could not be saved.");
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return (
      <PremiumShell>
        <PageState loading eyebrow="Account" title="Loading profile." description="Validating the server session." />
      </PremiumShell>
    );
  }

  if (!user) {
    return (
      <PremiumShell>
        <PageState
          eyebrow="Account required"
          title="Sign in to view your profile."
          description="Guest mode keeps browsing and practice available."
          action={<button className="button button-primary" onClick={() => router.push("/auth")}>sign in</button>}
        />
      </PremiumShell>
    );
  }

  return (
    <PremiumShell
      topbar={<TopNav eyebrow={`@${user.username}`} title="Profile" />}
    >
      <section className="profile-grid">
        <SurfaceCard className="profile-card">
          <div className="profile-avatar" aria-hidden="true">
            {user.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="eyebrow">{user.role.replace("_", " ")}</div>
            <h1>{user.displayName}</h1>
            <p>{user.email}</p>
          </div>
          <dl className="profile-facts">
            <div><dt>Username</dt><dd>@{user.username}</dd></div>
            <div><dt>Provider</dt><dd>Local credentials</dd></div>
            <div><dt>Role</dt><dd>{user.role.replace("_", " ")}</dd></div>
          </dl>
        </SurfaceCard>

        <SurfaceCard className="profile-card">
          <div>
            <div className="eyebrow">Account settings</div>
            <h2>Public display name</h2>
          </div>
          <form className="stack" onSubmit={save}>
            <label className="stack">
              <span className="form-label">Display name</span>
              <input
                className="input"
                value={displayName}
                onChange={(event) => setDisplayNameDraft(event.target.value.slice(0, 80))}
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            {message && <div className="form-message" role="status">{message}</div>}
            <div className="toolbar profile-actions">
              <button className="button button-primary" type="submit" disabled={pending}>
                {pending ? "saving…" : "save profile"}
              </button>
              <button
                className="button"
                type="button"
                onClick={async () => {
                  await logout();
                  socket.disconnect().connect();
                  router.replace("/");
                }}
              >
                sign out
              </button>
            </div>
          </form>
        </SurfaceCard>
      </section>
    </PremiumShell>
  );
}
