"use client";

import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";
import type { ApiMe } from "@/lib/api/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export type AppRole = "student" | "admin";

export interface AuthContextValue {
  session: Session | null;
  /** Resolved from GET /api/me. Null when signed out, unassigned, or not yet known. */
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normaliseRole(value: string | null): AppRole | null {
  return value === "student" || value === "admin" ? value : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    async function resolveRole(next: Session | null): Promise<void> {
      if (!next) {
        if (active) {
          setRole(null);
          setLoading(false);
        }
        return;
      }
      try {
        const me = await apiRequest<ApiMe>("/api/me", { token: next.access_token });
        if (active) setRole(normaliseRole(me.role));
      } catch {
        if (active) setRole(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        void resolveRole(data.session);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(true);
      void resolveRole(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, role, loading, signOut }),
    [session, role, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
