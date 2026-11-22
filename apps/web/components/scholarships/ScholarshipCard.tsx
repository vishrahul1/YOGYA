import Link from "next/link";
import Card from "@/components/ui/Card";
import type { SchemeListItem } from "@/lib/api/types";
import { formatDate } from "@/lib/scholarships/format";

export interface ScholarshipCardProps {
  item: SchemeListItem;
}

/** Presentational catalogue card. Shows only fields returned by GET /api/schemes. */
export default function ScholarshipCard({ item }: ScholarshipCardProps) {
  const verified = formatDate(item.verified_at) ?? "Not recorded";

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">
        <Link
          href={`/scholarships/${item.scheme_version_id}`}
          className="text-accent-blue hover:underline"
        >
          {item.name}
        </Link>
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-700">Issuing body</dt>
          <dd className="text-slate-900">{item.issuing_authority ?? "Not stated"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-700">Academic year</dt>
          <dd className="text-slate-900">{item.academic_year}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-700">Last verified</dt>
          <dd className="text-slate-900">{verified}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-700">Deadline</dt>
          <dd className="text-slate-900">{item.deadline_text ?? "Not stated"}</dd>
        </div>
      </dl>
    </Card>
  );
}
