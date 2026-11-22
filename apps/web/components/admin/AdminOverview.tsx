"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { schemeStatusLabel } from "@/components/admin/labels";
import type { AdminScheme, AdminSchemeListResponse } from "@/lib/api/adminTypes";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";

const LOAD_FAILED = "Could not load the scheme list. Please try again later.";
const PAGE_SIZE = 100;
const LIST_PATH = `/api/admin/schemes?limit=${PAGE_SIZE}&offset=0`;

/** Groups schemes by their backend status, keeping the order the backend returned them in. */
function groupByStatus(items: AdminScheme[]): Map<string, AdminScheme[]> {
  const groups = new Map<string, AdminScheme[]>();
  for (const item of items) {
    const group = groups.get(item.status);
    if (group) {
      group.push(item);
    } else {
      groups.set(item.status, [item]);
    }
  }
  return groups;
}

export default function AdminOverview() {
  const { data, error, loading } = useAuthedRequest<AdminSchemeListResponse>(LIST_PATH, LOAD_FAILED);

  if (loading && data === null && !error) {
    return <Spinner label="Loading schemes" />;
  }
  if (error) {
    return <ErrorMessage message={error} />;
  }
  if (data === null || data.items.length === 0) {
    return (
      <EmptyState
        title="No schemes yet"
        description="Create a scheme or import one from an official URL to start the verification workflow."
        action={
          <Link href="/admin/schemes/new" className="text-accent-blue underline">
            Create or import a scheme
          </Link>
        }
      />
    );
  }

  const groups = groupByStatus(data.items);
  return (
    <div className="space-y-6">
      {data.items.length >= PAGE_SIZE ? (
        <p className="text-sm text-slate-600">Showing the first {PAGE_SIZE} schemes.</p>
      ) : null}
      {Array.from(groups.entries()).map(([status, schemes]) => (
        <section key={status} aria-labelledby={`group-${status}`} className="space-y-3">
          <h2 id={`group-${status}`} className="text-lg font-semibold text-slate-900">
            {schemeStatusLabel(status)} ({schemes.length})
          </h2>
          <ul className="space-y-3">
            {schemes.map((scheme) => (
              <li key={scheme.id}>
                <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">{scheme.name}</p>
                    <p className="text-sm text-slate-600">
                      {scheme.slug}
                      {scheme.issuing_body ? ` · ${scheme.issuing_body}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/admin/schemes/${scheme.id}`}
                    className="text-sm font-medium text-accent-blue underline"
                  >
                    Open {scheme.name}
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
