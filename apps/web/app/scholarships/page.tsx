import Link from "next/link";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import ScholarshipCard from "@/components/scholarships/ScholarshipCard";
import { apiRequest } from "@/lib/api/client";
import type { SchemeListResponse } from "@/lib/api/types";

// Always fetch fresh results; the query string changes on every search or page.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 200;

interface ScholarshipsPageProps {
  searchParams: { q?: string; page?: string };
}

function parsePage(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function buildHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/scholarships?${query}` : "/scholarships";
}

const pageLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue";
const pageLinkDisabledClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-400";

export default async function ScholarshipsPage({ searchParams }: ScholarshipsPageProps) {
  const q = (searchParams.q ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const page = parsePage(searchParams.page);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
  });
  if (q) params.set("q", q);

  let result: SchemeListResponse | null = null;
  let loadError: string | null = null;
  try {
    result = await apiRequest<SchemeListResponse>(`/api/schemes?${params.toString()}`);
  } catch {
    loadError = "Could not load scholarships right now. Please try again later.";
  }

  const items = result?.items ?? [];
  // The backend returns no total count, so "Next" is enabled when a full page came back.
  const hasNext = items.length === PAGE_SIZE;
  const hasPrevious = page > 1;

  return (
    <section className="w-full space-y-8 pb-8">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Scholarships
        </h1>
        <p className="leading-7 text-slate-600">
          Explore published government scholarship schemes, compare key details, and follow their
          official sources when you are ready to apply.
        </p>
      </header>

      <form
        action="/scholarships"
        method="get"
        role="search"
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              label="Search scholarships"
              name="q"
              type="search"
              placeholder="Try a scheme name or keyword"
              defaultValue={q}
              maxLength={MAX_QUERY_LENGTH}
              className="min-h-11 bg-slate-50"
            />
          </div>
          <Button type="submit" className="min-h-11 rounded-xl bg-teal-700 px-6 hover:bg-teal-800">
            Search
          </Button>
        </div>
        {q ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Showing matches for “{q}”</span>
            <Link href="/scholarships" className="font-semibold text-teal-700 underline decoration-teal-300 underline-offset-4">
              Clear search
            </Link>
          </div>
        ) : null}
      </form>

      {loadError ? <ErrorMessage message={loadError} /> : null}

      {!loadError && items.length === 0 ? (
        <EmptyState
          title="No scholarships found"
          description={
            q
              ? "No published scholarships match your search. Try different words."
              : "No published scholarships are available yet."
          }
        />
      ) : null}

      {items.length > 0 ? (
        <section aria-labelledby="scholarship-results" className="space-y-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="scholarship-results" className="text-2xl font-bold tracking-tight text-slate-950">
                Available scholarships
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Showing {items.length} {items.length === 1 ? "scheme" : "schemes"} on page {page}
              </p>
            </div>
            <p className="text-sm text-slate-500">Eligibility is checked separately for each scheme.</p>
          </div>
          <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {items.map((item) => (
              <li key={item.scheme_version_id}>
                <ScholarshipCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!loadError && (hasPrevious || hasNext) ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-slate-200 pt-6">
          {hasPrevious ? (
            <Link href={buildHref(q, page - 1)} className={pageLinkClass}>
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={pageLinkDisabledClass}>
              Previous
            </span>
          )}
          <p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">Page {page}</p>
          {hasNext ? (
            <Link href={buildHref(q, page + 1)} className={pageLinkClass}>
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className={pageLinkDisabledClass}>
              Next
            </span>
          )}
        </nav>
      ) : null}
    </section>
  );
}
