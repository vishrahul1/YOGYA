import Link from "next/link";
import RequireAuth from "@/components/auth/RequireAuth";
import CreateSchemeForm from "@/components/admin/CreateSchemeForm";

export default function NewSchemePage() {
  return (
    <RequireAuth role="admin">
      <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <Link href="/admin" className="text-sm font-semibold text-teal-700 underline underline-offset-4">← Admin dashboard</Link>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Step 1 of 2 · Scholarship information</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Create a scholarship</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Enter the required details, open optional sections only when needed, and save once.</p>
        </header>
        <CreateSchemeForm />
        <details className="mx-auto mt-8 max-w-4xl border-t border-slate-200 pt-5">
          <summary className="cursor-pointer font-semibold text-teal-800">How publishing works after saving</summary>
          <ol className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-4">
            <li><strong>1. Verify source</strong><br />Check the official page.</li>
            <li><strong>2. Submit</strong><br />Send the draft for review.</li>
            <li><strong>3. Approve</strong><br />Confirm the evidence.</li>
            <li><strong>4. Publish</strong><br />Show it to students.</li>
          </ol>
        </details>
      </main>
    </RequireAuth>
  );
}
