import Link from "next/link";
import RequireAuth from "@/components/auth/RequireAuth";
import CreateSchemeForm from "@/components/admin/CreateSchemeForm";

export default function NewSchemePage() {
  return (
    <RequireAuth role="admin">
      <main className="mx-auto w-full max-w-6xl py-4">
        <header className="relative mb-10 border-b border-slate-300 pb-6 pr-28">
          <Link href="/admin" className="absolute right-0 top-0 inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">← Back</Link>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">New scholarship</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Scholarship information</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Add the official details first. Optional information stays collapsed until you need it.</p>
        </header>
        <CreateSchemeForm />
        <details className="mx-auto mt-8 max-w-5xl border-t border-slate-200 pt-5">
          <summary className="cursor-pointer font-semibold text-teal-800">What happens after saving?</summary>
          <ol className="mt-4 grid gap-6 text-sm text-slate-700 sm:grid-cols-2">
            <li className="border-l-2 border-teal-600 pl-4"><strong className="block text-slate-950">1. Complete the draft</strong>Verify the official source and required information.</li>
            <li className="border-l-2 border-slate-300 pl-4"><strong className="block text-slate-950">2. Publish</strong>Release the verified scholarship to students.</li>
          </ol>
        </details>
      </main>
    </RequireAuth>
  );
}
