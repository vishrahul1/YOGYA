import Link from "next/link";
import HomeActions from "@/components/home/HomeActions";

const STEPS = [
  {
    number: "01",
    title: "Explore verified schemes",
    description: "Browse published scholarships and review their official source information.",
  },
  {
    number: "02",
    title: "Understand your eligibility",
    description: "Check your details against fixed scholarship rules and see what information is missing.",
  },
  {
    number: "03",
    title: "Prepare with confidence",
    description: "Organise required documents and track your application progress in one place.",
  },
];

const SUPPORT_ITEMS = [
  "Published scheme information",
  "Rule-based eligibility checks",
  "Clear document checklists",
];

export default function HomePage() {
  return (
    <div className="w-full space-y-16 pb-8 md:space-y-24">
      <section className="relative isolate overflow-hidden rounded-3xl bg-slate-950 px-6 py-12 text-white shadow-xl shadow-slate-200/60 sm:px-10 sm:py-16 lg:px-16 lg:py-20">
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-1 text-sm font-medium text-teal-100">
              Scholarship guidance, made clearer
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Find the right scholarship. Know what to do next.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              YOGYA helps students discover government scholarships, understand eligibility
              requirements, prepare documents, and follow official application routes.
            </p>
            <HomeActions />
            <p className="mt-5 text-sm text-slate-400">
              Always apply through the official government portal.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:ml-auto">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur sm:p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">YOGYA</p>
                  <h2 className="mt-1 text-xl font-semibold">Your scholarship path</h2>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-200">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4 7 8-4 8 4-8 4-8-4Zm3 2.5V15c2.7 2 7.3 2 10 0V9.5M20 7v6" />
                  </svg>
                </span>
              </div>
              <ul className="mt-5 space-y-3">
                {SUPPORT_ITEMS.map((item, index) => (
                  <li key={item} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-400/20 text-sm font-semibold text-teal-100">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-100">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="space-y-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">A simpler process</p>
          <h2 id="how-it-works" className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            From discovery to application
          </h2>
          <p className="mt-3 text-lg leading-8 text-slate-600">
            Move through each step with clear information and practical guidance.
          </p>
        </div>

        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.number} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="text-sm font-bold tracking-[0.18em] text-teal-700">{step.number}</span>
              <h3 className="mt-5 text-xl font-semibold text-slate-950">{step.title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="overflow-hidden rounded-3xl border border-teal-100 bg-teal-50 px-6 py-10 sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-10">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">Start with trusted information</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Browse published scholarship schemes</h2>
          <p className="mt-3 leading-7 text-slate-700">
            Review issuing authorities, academic years, deadlines, verification dates, and official
            sources before deciding your next step.
          </p>
        </div>
        <Link
          href="/scholarships"
          className="mt-6 inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-50 lg:mt-0"
        >
          Browse all scholarships
          <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </section>
    </div>
  );
}
