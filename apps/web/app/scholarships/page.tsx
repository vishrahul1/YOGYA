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
  "rounded-lg border border-accent-blue px-4 py-2 font-medium text-accent-blue hover:bg-blue-50";
const pageLinkDisabledClass =
  "rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-400";

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
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Scholarships</h1>
        <p className="max-w-2xl text-slate-600">
          Published scholarship schemes with their official sources. Listing a scheme does not
          mean you are eligible. Apply only through official government portals.
        </p>
      </header>

      <form action="/scholarships" method="get" role="search" className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Input
            label="Search by scheme name"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={MAX_QUERY_LENGTH}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
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
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <li key={item.scheme_version_id}>
              <ScholarshipCard item={item} />
            </li>
          ))}
        </ul>
      ) : null}

      {!loadError && (hasPrevious || hasNext) ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          {hasPrevious ? (
            <Link href={buildHref(q, page - 1)} className={pageLinkClass}>
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={pageLinkDisabledClass}>
              Previous
            </span>
          )}
          <p className="text-sm text-slate-600">Page {page}</p>
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
