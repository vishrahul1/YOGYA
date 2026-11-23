import Link from "next/link";
import { notFound } from "next/navigation";
import SaveSchemeButton from "@/components/tracking/SaveSchemeButton";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import { ApiError, apiRequest } from "@/lib/api/client";
import type { SchemeDetail } from "@/lib/api/types";
import { formatDate, safeHttpsUrl } from "@/lib/scholarships/format";

// Always fetch the current published version.
export const dynamic = "force-dynamic";

interface ScholarshipDetailPageProps {
  params: { id: string };
}

export default async function ScholarshipDetailPage({ params }: ScholarshipDetailPageProps) {
  let scheme: SchemeDetail;
  try {
    scheme = await apiRequest<SchemeDetail>(
      `/api/schemes/${encodeURIComponent(params.id)}`,
    );
  } catch (err) {
    // 422 means the id is not a valid identifier, so no scheme can match it.
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) {
      notFound();
    }
    return (
      <section className="w-full space-y-4">
        <Link href="/scholarships" className="font-medium text-teal-700 underline underline-offset-4">
          ← Back to scholarships
        </Link>
        <ErrorMessage message="Could not load this scholarship right now. Please try again later." />
      </section>
    );
  }

  const verified = formatDate(scheme.verified_at) ?? "Not recorded";
  const officialUrl = safeHttpsUrl(scheme.official_url);

  return (
    <section className="w-full space-y-6 pb-8">
      <Link
        href="/scholarships"
        className="inline-flex items-center rounded-sm font-medium text-teal-700 underline decoration-teal-300 underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
      >
        ← Back to scholarships
      </Link>

      <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="h-2 bg-gradient-to-r from-teal-500 via-teal-400 to-blue-500" />
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              Academic year {scheme.academic_year}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Published scheme
            </span>
          </div>
          <h1 className="mt-5 max-w-4xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {scheme.name}
          </h1>
          <p className="mt-3 text-base font-medium text-slate-600">
            {scheme.issuing_authority ?? "Issuing authority not stated"}
          </p>
          {scheme.benefit_summary ? (
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-700">{scheme.benefit_summary}</p>
          ) : null}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-0">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-950">Scholarship overview</h2>
            </div>
            <dl className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
              <div className="bg-white px-6 py-5">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Issuing authority</dt>
                <dd className="mt-2 text-sm font-medium text-slate-900">{scheme.issuing_authority ?? "Not stated"}</dd>
              </div>
              <div className="bg-white px-6 py-5">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Academic year</dt>
                <dd className="mt-2 text-sm font-medium text-slate-900">{scheme.academic_year}</dd>
              </div>
              <div className="bg-white px-6 py-5">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Last verified</dt>
                <dd className="mt-2 text-sm font-medium text-slate-900">{verified}</dd>
              </div>
              <div className="bg-white px-6 py-5">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Application deadline</dt>
                <dd className="mt-2 text-sm font-medium text-slate-900">{scheme.deadline_text ?? "Not stated"}</dd>
              </div>
              <div className="bg-white px-6 py-5">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Applications open</dt>
                <dd className="mt-2 text-sm font-medium text-slate-900">{formatDate(scheme.application_start_date)}</dd>
              </div>
              <div className="bg-white px-6 py-5">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Applications close</dt>
                <dd className="mt-2 text-sm font-medium text-slate-900">{formatDate(scheme.application_end_date)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Prepare before applying</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Required documents</h2>
            </div>
            {scheme.required_documents.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {scheme.required_documents.map((document, index) => (
                  <li key={`${document.document_kind}-${document.document_name}-${index}`} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5 10 3 3 7-7" />
                      </svg>
                    </span>
                    <div>
                      <p className="font-medium text-slate-900">{document.document_name}</p>
                      <p className="mt-1 text-sm text-slate-500">{document.is_mandatory ? "Required document" : "Optional document"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                No document checklist is published here yet. Review the official source before applying.
              </p>
            )}
          </Card>

          <aside aria-label="Important information" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <p className="font-semibold">Important before you apply</p>
            <p className="mt-1">
              Eligibility is not guaranteed. Read the official scheme information carefully and apply
              only through the official government portal. YOGYA does not submit applications for you.
            </p>
          </aside>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">Ready for the next step?</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Check this scheme against your details or save it for later.
              </p>
            </div>
            <Link
              href={`/eligibility/${scheme.scheme_version_id}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2"
            >
              Check eligibility
            </Link>
            <SaveSchemeButton schemeVersionId={scheme.scheme_version_id} />
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold text-slate-950">Official source</h2>
            <p className="text-sm leading-6 text-slate-600">
              Confirm the latest requirements and submit your application only on the official website.
            </p>
            {officialUrl ? (
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
              >
                Visit official website
                <span aria-hidden="true" className="ml-2">↗</span>
              </a>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No official link is available for this scheme.</p>
            )}
            <p className="text-xs text-slate-500">Last verified {verified}</p>
          </Card>
        </aside>
      </div>
    </section>
  );
}
