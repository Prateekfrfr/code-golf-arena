"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authClient } from "@/lib/auth-client";
import type { AuthUser } from "@/types/domain";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const { data: sessionData, isPending: sessionPending } = authClient.useSession();

  const toAuthUser = useCallback((sessionUser: NonNullable<typeof sessionData>["user"]): AuthUser => ({
    id: sessionUser.id,
    email: sessionUser.email,
    username:
      (sessionUser as { username?: string }).username ??
      sessionUser.name ??
      sessionUser.email.split("@")[0],
    displayName: sessionUser.name ?? sessionUser.email,
    avatar: sessionUser.image ?? null,
    provider: ((sessionUser as { provider?: AuthUser["provider"] }).provider ?? "credentials"),
    role:
      ((sessionUser as { role?: AuthUser["role"] }).role as AuthUser["role"]) ??
      "user",
  }), []);

  const refresh = useCallback(async () => {
    const result = await authClient.getSession();
    if (!result.data?.user) {
      setUser(null);
      return null;
    }
    const mappedUser = toAuthUser(result.data.user);
    setUser(mappedUser);
    return mappedUser;
  }, [toAuthUser]);

  useEffect(() => {
    // The Better Auth React store is the source of truth and broadcasts
    // sign-in/sign-out changes. Defer the derived React state update so this
    // effect stays a subscription synchronization rather than a render loop.
    if (sessionPending) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) setUser(sessionData?.user ? toAuthUser(sessionData.user) : null);
    });
    return () => {
      active = false;
    };
  }, [sessionData, sessionPending, toAuthUser]);

  const logout = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // Ignore
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading: sessionPending, refresh, setUser, logout }),
    [logout, refresh, sessionPending, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

export const canAuthorProblems = (user: AuthUser | null) =>
  Boolean(
    user &&
      ["problem_setter", "moderator", "admin"].includes(user.role),
  );

