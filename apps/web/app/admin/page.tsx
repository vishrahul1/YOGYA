import Link from "next/link";
import RequireAuth from "@/components/auth/RequireAuth";
import AdminOverview from "@/components/admin/AdminOverview";

export default function AdminPage() {
  return (
    <RequireAuth role="admin">
      <section className="space-y-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Scholarship administration</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Review drafts, verify official evidence, and publish trusted scholarships.
            </p>
          </div>
          <Link
            href="/admin/schemes/new"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 px-5 font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Add scholarship
          </Link>
        </header>
        <AdminOverview />
      </section>
    </RequireAuth>
  );
}
