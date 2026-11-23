import Link from "next/link";
import RequireAuth from "@/components/auth/RequireAuth";
import AdminOverview from "@/components/admin/AdminOverview";

export default function AdminPage() {
  return (
    <RequireAuth role="admin">
      <section className="space-y-8">
        <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8 lg:flex lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-300">Catalogue operations</p>
            <h1 className="text-3xl font-bold">Scholarship administration</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Record candidates, maintain official evidence, review academic-year versions, and
              publish verified scholarships. Automation will feed this same review queue later.
            </p>
          </div>
          <Link
            href="/admin/schemes/new"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-500 px-5 font-semibold text-slate-950 hover:bg-teal-400 lg:mt-0"
          >
            Add scholarship
          </Link>
        </header>
        <section aria-labelledby="workflow-heading" className="grid gap-3 md:grid-cols-4">
          <h2 id="workflow-heading" className="sr-only">Admin workflow</h2>
          {[
            ["1", "Find or record", "Enter a scheme manually or record its official URL."],
            ["2", "Add evidence", "Create a version and attach official government sources."],
            ["3", "Review and verify", "Check the source, then approve deterministic details."],
            ["4", "Publish", "Release only the verified version to students."],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-bold text-teal-700">STEP {step}</span>
              <h3 className="mt-1 font-semibold text-slate-950">{title}</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
            </div>
          ))}
        </section>
        <AdminOverview />
      </section>
    </RequireAuth>
  );
}
