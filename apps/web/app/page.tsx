import Link from "next/link";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">YOGYA</h1>
      <p className="max-w-xl text-slate-600">
        Find government scholarships you may be eligible for, with clear document
        checklists and guidance to apply through official portals.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/scholarships"
          className="rounded-lg bg-accent-teal px-4 py-2 font-medium text-white hover:bg-teal-700"
        >
          Browse scholarships
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-accent-blue px-4 py-2 font-medium text-accent-blue hover:bg-blue-50"
        >
          Log in
        </Link>
      </div>
    </section>
  );
}

