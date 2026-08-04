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
import { apiRequest, ApiError } from "@/lib/api";
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
  const [loading, setLoading] = useState(true);

  const { data: sessionData, isPending: sessionPending } = authClient.useSession();

  const refresh = useCallback(async () => {
    try {
      const result = await apiRequest<{ user: AuthUser }>("/api/auth/me");
      setUser(result.user);
      return result.user;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 503)) {
        setUser(null);
        return null;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (sessionData?.user) {
      const mappedUser: AuthUser = {
        id: sessionData.user.id,
        email: sessionData.user.email,
        username:
          (sessionData.user as { username?: string }).username ??
          sessionData.user.name ??
          sessionData.user.email.split("@")[0],
        displayName: sessionData.user.name ?? sessionData.user.email,
        avatar: sessionData.user.image ?? null,
        provider: "credentials",
        role:
          ((sessionData.user as { role?: AuthUser["role"] }).role as AuthUser["role"]) ??
          "user",
      };
      setUser(mappedUser);
      setLoading(false);
      return;
    }

    if (!sessionPending) {
      apiRequest<{ user: AuthUser }>("/api/auth/me")
        .then((result) => {
          if (active) setUser(result.user);
        })
        .catch(() => {
          if (active) setUser(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [sessionData, sessionPending]);

  const logout = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // Ignore
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, setUser, logout }),
    [loading, logout, refresh, user],
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

