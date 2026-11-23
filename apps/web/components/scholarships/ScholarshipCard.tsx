import Link from "next/link";
import type { SchemeListItem } from "@/lib/api/types";
import { formatDate } from "@/lib/scholarships/format";

export interface ScholarshipCardProps {
  item: SchemeListItem;
}

/** Presentational catalogue card. Shows only fields returned by GET /api/schemes. */
export default function ScholarshipCard({ item }: ScholarshipCardProps) {
  const verified = formatDate(item.verified_at) ?? "Not recorded";

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg hover:shadow-slate-200/70">
      <div className="h-1.5 bg-gradient-to-r from-teal-500 via-teal-400 to-blue-500" />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            {item.academic_year}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Verified {verified}
          </span>
        </div>

        <h2 className="mt-5 text-xl font-semibold leading-7 text-slate-950">
          <Link
            href={`/scholarships/${item.scheme_version_id}`}
            className="rounded-sm outline-none transition group-hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-accent-blue"
          >
            {item.name}
          </Link>
        </h2>
        <p className="mt-2 text-sm font-medium text-slate-500">
          {item.issuing_authority ?? "Issuing authority not stated"}
        </p>

        <p className="mt-4 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">
          {item.benefit_summary ?? "Open the scholarship to review its published details and official source."}
        </p>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Deadline</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{item.deadline_text ?? "Not stated"}</p>
            </div>
            <Link
              href={`/scholarships/${item.scheme_version_id}`}
              aria-label={`View details for ${item.name}`}
              className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 transition group-hover:bg-teal-700 group-hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            >
              View details
              <span aria-hidden="true" className="ml-1.5">→</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
