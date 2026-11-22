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
      <section className="space-y-4">
        <Link href="/scholarships" className="text-accent-blue underline">
          Back to scholarships
        </Link>
        <ErrorMessage message="Could not load this scholarship right now. Please try again later." />
      </section>
    );
  }

  const verified = formatDate(scheme.verified_at) ?? "Not recorded";
  const officialUrl = safeHttpsUrl(scheme.official_url);

  return (
    <section className="space-y-6">
      <Link href="/scholarships" className="text-accent-blue underline">
        Back to scholarships
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">{scheme.name}</h1>
      </header>

      <Card>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-700">Issuing authority</dt>
            <dd className="text-slate-900">{scheme.issuing_authority ?? "Not stated"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Academic year</dt>
            <dd className="text-slate-900">{scheme.academic_year}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Last verified</dt>
            <dd className="text-slate-900">{verified}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Deadline</dt>
            <dd className="text-slate-900">{scheme.deadline_text ?? "Not stated"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-slate-700">Official source</dt>
            <dd className="text-slate-900">
              {officialUrl ? (
                <a
                  href={officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-accent-blue underline"
                >
                  {officialUrl} (opens in a new tab)
                </a>
              ) : (
                "No official link is available for this scheme."
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <SaveSchemeButton schemeVersionId={scheme.scheme_version_id} />

      <aside
        aria-label="Important information"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <p>
          Eligibility is not guaranteed. Read the official scheme information carefully and apply
          only through the official government portal. YOGYA does not submit applications for you.
        </p>
      </aside>
    </section>
  );
}
