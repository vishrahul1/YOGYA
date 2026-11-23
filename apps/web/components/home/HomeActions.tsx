"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/session";

const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";
const secondaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-600 bg-white/5 px-5 py-3 font-semibold text-white transition hover:border-slate-400 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

export default function HomeActions() {
  const { session, role, loading } = useAuth();

  if (loading) {
    return <div className="mt-8 h-12 w-48 animate-pulse rounded-xl bg-white/10" aria-hidden="true" />;
  }

  if (session) {
    const destination = role === "admin" ? "/admin" : role === "student" ? "/dashboard" : "/scholarships";
    const label = role === "admin" ? "Open admin dashboard" : role === "student" ? "Open student dashboard" : "Browse scholarships";
    return (
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href={destination} className={primaryClass}>
          {label}
          <span aria-hidden="true" className="ml-2">→</span>
        </Link>
        <Link href="/scholarships" className={secondaryClass}>
          Browse scholarships
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Link href="/scholarships" className={primaryClass}>
        Explore scholarships
        <span aria-hidden="true" className="ml-2">→</span>
      </Link>
      <Link href="/register" className={secondaryClass}>
        Create student account
      </Link>
    </div>
  );
}
