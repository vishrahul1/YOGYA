"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/session";

export interface RequireAuthProps {
  role?: AppRole;
  children: ReactNode;
}

/** Home page for each role. Used when a signed-in user opens a page for the other role. */
function roleHome(role: AppRole): string {
  return role === "admin" ? "/admin" : "/dashboard";
}

/**
 * UI-only route guard. The backend still enforces every permission.
 */
export default function RequireAuth({ role, children }: RequireAuthProps) {
  const router = useRouter();
  const { session, role: currentRole, loading } = useAuth();

  const roleMismatch = role !== undefined && currentRole !== role;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (role !== undefined && currentRole !== null && currentRole !== role) {
      router.replace(roleHome(currentRole));
    }
  }, [loading, session, role, currentRole, router]);

  if (loading) {
    return <Spinner />;
  }
  if (!session) {
    return null;
  }
  if (roleMismatch && currentRole === null) {
    return (
      <ErrorMessage message="Your account does not have an application role yet. Please contact support." />
    );
  }
  if (roleMismatch) {
    return null;
  }
  return <>{children}</>;
}
