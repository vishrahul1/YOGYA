import Link from "next/link";
import RequireAuth from "@/components/auth/RequireAuth";
import AdminOverview from "@/components/admin/AdminOverview";

export default function AdminPage() {
  return (
    <RequireAuth role="admin">
      <section className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">Admin dashboard</h1>
            <p className="text-sm text-slate-600">
              Candidate schemes grouped by status. Only verified and published versions reach the
              public catalogue.
            </p>
          </div>
          <Link
            href="/admin/schemes/new"
            className="rounded-lg bg-accent-teal px-4 py-2 text-center font-medium text-white hover:bg-teal-700"
          >
            Create or import scheme
          </Link>
        </header>
        <AdminOverview />
      </section>
    </RequireAuth>
  );
}
