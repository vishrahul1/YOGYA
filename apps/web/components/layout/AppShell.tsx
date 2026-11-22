"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/session";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/scholarships", label: "Scholarships" },
  { href: "/login", label: "Login" },
];

/** Shown only to signed-in students. The pages themselves are guarded by RequireAuth. */
const STUDENT_NAV_ITEMS = [
  { href: "/saved", label: "Saved" },
  { href: "/applications", label: "Applications" },
  { href: "/checklists", label: "Checklists" },
];

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
    <div className="px-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="block w-full rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-blue-50 hover:text-accent-blue disabled:opacity-60"
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
  const { session, role } = useAuth();
  const navItems =
    role === "student" ? [...NAV_ITEMS, ...STUDENT_NAV_ITEMS] : NAV_ITEMS;

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="p-6">
          <p className="text-lg font-bold text-accent-teal">YOGYA</p>
        </div>
        <nav aria-label="Main" className="px-3">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-blue-50 hover:text-accent-blue"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {session ? (
          <div className="mt-4">
            <LogoutButton />
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <p className="text-lg font-bold text-accent-teal">YOGYA</p>
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
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-blue-50 hover:text-accent-blue"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            {session ? (
              <div className="mt-2">
                <LogoutButton onDone={() => setMenuOpen(false)} />
              </div>
            ) : null}
          </nav>
        ) : null}

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

