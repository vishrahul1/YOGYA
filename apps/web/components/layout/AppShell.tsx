"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import AssistantFloatingWidget from "@/components/assistant/AssistantFloatingWidget";
import { useAuth } from "@/lib/auth/session";

const GUEST_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/scholarships", label: "Scholarships" },
  { href: "/login", label: "Login" },
];

const STUDENT_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scholarships", label: "Scholarships" },
  { href: "/assistant", label: "Assistant" },
  { href: "/saved", label: "Saved" },
  { href: "/applications", label: "Applications" },
  { href: "/checklists", label: "Checklists" },
];

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Admin dashboard" },
  { href: "/admin/schemes/new", label: "Add scholarship" },
  { href: "/scholarships", label: "Public scholarships" },
];

function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function LogoutButton({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    setBusy(true);
    setFailed(false);
    try {
      await signOut();
      onDone?.();
      router.push("/login");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="block min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue disabled:opacity-60"
      >
        {busy ? "Logging out..." : "Log out"}
      </button>
      {failed ? (
        <p role="alert" className="px-3 py-1 text-sm text-red-700">
          Could not log out. Please try again.
        </p>
      ) : null}
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { session, role, loading } = useAuth();
  const navItems = loading
    ? []
    : role === "student"
      ? STUDENT_NAV_ITEMS
      : role === "admin"
        ? ADMIN_NAV_ITEMS
        : session
          ? [{ href: "/scholarships", label: "Scholarships" }]
          : GUEST_NAV_ITEMS;
  const logoHref = role === "student" ? "/dashboard" : role === "admin" ? "/admin" : "/";

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="px-6 pb-5 pt-7">
          <Link href={logoHref} className="inline-flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-sm font-bold text-white">Y</span>
            <span>
              <span className="block text-lg font-bold leading-5 text-slate-950">YOGYA</span>
              <span className="text-xs font-medium text-slate-500">Scholarship guide</span>
            </span>
          </Link>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = isCurrentPath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block min-h-11 rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
                      active
                        ? "bg-teal-50 text-teal-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {session ? (
          <div className="border-t border-slate-100 p-3">
            <LogoutButton />
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <Link href={logoHref} className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-sm font-bold text-white">Y</span>
            <span className="text-lg font-bold text-slate-950">YOGYA</span>
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-accent-blue"
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </header>

        {menuOpen ? (
          <nav
            id="mobile-nav"
            aria-label="Mobile"
            className="border-b border-slate-200 bg-white px-4 py-2 md:hidden"
          >
            <ul className="space-y-1 py-1">
              {navItems.map((item) => {
                const active = isCurrentPath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={`block min-h-11 rounded-xl px-3 py-2.5 text-sm font-medium ${
                        active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {session ? (
              <div className="mt-2">
                <LogoutButton onDone={() => setMenuOpen(false)} />
              </div>
            ) : null}
          </nav>
        ) : null}

        <main className="flex-1 p-3 sm:p-4 md:p-5">{children}</main>
        {role === "student" && pathname !== "/assistant" ? <AssistantFloatingWidget /> : null}
      </div>
    </div>
  );
}

