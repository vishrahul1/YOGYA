"use client";

import Link from "next/link";
import { useState } from "react";
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

/** Presents the detailed backend lifecycle as two clear admin-facing phases. */
function groupByPhase(items: AdminScheme[]): Map<"draft" | "published", AdminScheme[]> {
  const groups = new Map<string, AdminScheme[]>();
  for (const item of items) {
    const phase = item.status === "published" ? "published" : "draft";
    const group = groups.get(phase);
    if (group) {
      group.push(item);
    } else {
      groups.set(phase, [item]);
    }
  }
  return groups as Map<"draft" | "published", AdminScheme[]>;
}

export default function AdminOverview() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const statuses = ["draft", "published"] as const;
  const counts = new Map([
    ["draft", data.items.filter((item) => item.status !== "published").length],
    ["published", data.items.filter((item) => item.status === "published").length],
  ]);
  const normalisedQuery = query.trim().toLowerCase();
  const filtered = data.items.filter((item) =>
    (statusFilter === "all" || (statusFilter === "published" ? item.status === "published" : item.status !== "published")) &&
    (normalisedQuery.length === 0 || `${item.name} ${item.slug} ${item.issuing_body ?? ""}`.toLowerCase().includes(normalisedQuery)),
  );
  const groups = groupByPhase(filtered);
  return (
    <div className="space-y-6">
      <section aria-label="Scheme counts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
            className={`rounded-2xl border p-4 text-left transition ${statusFilter === status ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-200"}`}
          >
            <span className="block text-2xl font-bold text-slate-950">{counts.get(status) ?? 0}</span>
            <span className="text-sm font-medium text-slate-600">{schemeStatusLabel(status)}</span>
          </button>
        ))}
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Search schemes</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by scheme, slug, or issuing body"
            className="min-h-11 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </label>
        {statusFilter !== "all" || query ? (
          <button type="button" onClick={() => { setStatusFilter("all"); setQuery(""); }} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-teal-700 hover:bg-teal-50">Clear filters</button>
        ) : null}
      </div>

      {data.items.length >= PAGE_SIZE ? (
        <p className="text-sm text-slate-600">Showing the first {PAGE_SIZE} schemes.</p>
      ) : null}
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-600">No schemes match these filters.</p>
      ) : statuses
        .map((status) => [status, groups.get(status)] as const)
        .filter((entry): entry is readonly ["draft" | "published", AdminScheme[]] => Boolean(entry[1]))
        .map(([status, schemes]) => (
        <section key={status} aria-labelledby={`group-${status}`} className="space-y-3">
          <h2 id={`group-${status}`} className="text-lg font-semibold text-slate-900">
            {schemeStatusLabel(status)} ({schemes.length})
          </h2>
          <ul className="space-y-3">
            {schemes.map((scheme) => (
              <li key={scheme.id}>
                <Link
                  href={`/admin/schemes/${scheme.id}`}
                  aria-label={`Open ${scheme.name}`}
                  className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                >
                <Card className="flex flex-col gap-2 p-4 transition group-hover:border-teal-300 group-hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900 transition group-hover:text-teal-800">{scheme.name}</p>
                    <p className="text-sm text-slate-600">
                      {scheme.slug}
                      {scheme.issuing_body ? ` · ${scheme.issuing_body}` : ""}
                    </p>
                  </div>
                </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
