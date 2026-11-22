"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  SELF_REPORTED_NOTE,
} from "@/components/tracking/labels";
import { usePublicSchemes } from "@/components/tracking/usePublicSchemes";
import { apiRequest } from "@/lib/api/client";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import type {
  ApplicationStatus,
  ApplicationStatusUpdateRequest,
  StudentApplication,
  StudentApplicationListResponse,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/session";
import { formatDate, safeHttpsUrl } from "@/lib/scholarships/format";

const LOAD_FAILED = "Could not load your applications. Please try again later.";

function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export default function ApplicationsSection() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { data, error, loading, reload } = useAuthedRequest<StudentApplicationListResponse>(
    "/api/student/applications",
    LOAD_FAILED,
  );
  const catalogue = usePublicSchemes();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleStatusChange(application: StudentApplication, value: string) {
    if (!token || !isApplicationStatus(value) || value === application.status) return;
    setBusyId(application.id);
    setActionError(null);
    const body: ApplicationStatusUpdateRequest = { status: value };
    try {
      await apiRequest<StudentApplication>(
        `/api/student/applications/${encodeURIComponent(application.id)}`,
        { method: "PATCH", token, body },
      );
      reload();
    } catch {
      setActionError("Could not update the status. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && data === null && !error) {
    return <Spinner label="Loading applications" />;
  }
  if (error) {
    return <ErrorMessage message={error} />;
  }

  return (
    <div className="space-y-4">
      <p
        role="note"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        {SELF_REPORTED_NOTE}
      </p>
      {actionError ? <ErrorMessage message={actionError} /> : null}

      {data === null || data.items.length === 0 ? (
        <EmptyState
          title="No applications tracked yet"
          description="Applications you track here are your own records. YOGYA does not submit applications."
        />
      ) : (
        <ul className="space-y-4">
          {data.items.map((application) => {
            const scheme = catalogue.items?.find(
              (s) => s.scheme_version_id === application.scheme_version_id,
            );
            const officialUrl = safeHttpsUrl(scheme?.official_url ?? null);
            const updated = formatDate(application.status_updated_at);
            const selectId = `status-${application.id}`;
            return (
              <li key={application.id}>
                <Card className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {scheme?.name ?? "Scholarship (name not available here)"}
                    </h2>
                    {updated ? (
                      <p className="text-sm text-slate-600">Status last updated {updated}</p>
                    ) : null}
                    {application.portal_reference ? (
                      <p className="text-sm text-slate-700">
                        Portal reference (self-reported): {application.portal_reference}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
                      Your self-reported status
                    </label>
                    <select
                      id={selectId}
                      value={application.status}
                      disabled={busyId === application.id}
                      onChange={(e) => handleStatusChange(application, e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue sm:max-w-md"
                    >
                      {APPLICATION_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {APPLICATION_STATUS_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {officialUrl ? (
                    <p className="text-sm">
                      <a
                        href={officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-accent-blue underline"
                      >
                        Official application link (opens in a new tab)
                      </a>
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">
                      No official link is available here. Check the scholarship details or the
                      official government portal.
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
