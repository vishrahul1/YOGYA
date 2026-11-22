import Link from "next/link";
import RequireAuth from "@/components/auth/RequireAuth";
import CreateSchemeForm from "@/components/admin/CreateSchemeForm";
import ImportSchemeForm from "@/components/admin/ImportSchemeForm";

export default function NewSchemePage() {
  return (
    <RequireAuth role="admin">
      <section className="space-y-10">
        <Link href="/admin" className="text-accent-blue underline">
          Back to admin dashboard
        </Link>

        <div className="space-y-4">
          <header className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">Create a scheme</h1>
            <p className="text-sm text-slate-600">
              Creates a draft. A draft is not visible in the public catalogue.
            </p>
          </header>
          <CreateSchemeForm />
        </div>

        <div className="space-y-4">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">Import from an official URL</h2>
          </header>
          <ImportSchemeForm />
        </div>
      </section>
    </RequireAuth>
  );
}
