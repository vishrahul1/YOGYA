"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import type { ApplicationStatus, StudentApplicationListResponse } from "@/lib/api/types";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import { formatDate } from "@/lib/scholarships/format";

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted_on_portal: "Submitted on the official portal",
  reported_result: "Result reported",
  withdrawn: "Withdrawn",
};

export default function ApplicationProgressSection() {
  const state = useAuthedRequest<StudentApplicationListResponse>(
    "/api/student/applications",
    "Could not load your applications right now. Please try again later.",
  );
  const items = state.data?.items ?? [];

  // Counts are computed from the returned items, never hardcoded.
  const countsByStatus = (Object.keys(STATUS_LABELS) as ApplicationStatus[])
    .map((status) => ({
      status,
      count: items.filter((item) => item.status === status).length,
    }))
    .filter((entry) => entry.count > 0);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Application progress</h2>
        <p className="text-xs text-slate-600">Self-reported. Applications are made on official portals.</p>
      </div>
      {state.loading ? <Spinner label="Loading applications" /> : null}
      {state.error ? <ErrorMessage message={state.error} /> : null}
      {!state.loading && !state.error && state.data !== null ? (
        items.length === 0 ? (
          <p className="text-sm text-slate-700">No applications tracked yet.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2 text-sm">
              {countsByStatus.map((entry) => (
                <li key={entry.status} className="rounded-full bg-slate-100 px-3 py-1 text-slate-900">
                  {STATUS_LABELS[entry.status]}: {entry.count}
                </li>
              ))}
            </ul>
            <ul className="divide-y divide-slate-200">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between">
                  <span className="text-slate-900">{STATUS_LABELS[item.status]}</span>
                  <span className="text-slate-600">
                    Updated {formatDate(item.status_updated_at) ?? "date not recorded"}
                  </span>
                  <Link
                    href={`/scholarships/${encodeURIComponent(item.scheme_version_id)}`}
                    className="text-accent-blue underline"
                  >
                    View scholarship
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </Card>
  );
}
