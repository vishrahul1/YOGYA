"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import type { SavedSchemeListResponse } from "@/lib/api/types";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import { formatDate } from "@/lib/scholarships/format";

export default function SavedSchemesSection() {
  const state = useAuthedRequest<SavedSchemeListResponse>(
    "/api/student/saved-schemes",
    "Could not load your saved scholarships right now. Please try again later.",
  );

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Saved scholarships</h2>
      {state.loading ? <Spinner label="Loading saved scholarships" /> : null}
      {state.error ? <ErrorMessage message={state.error} /> : null}
      {!state.loading && !state.error && state.data !== null ? (
        state.data.items.length === 0 ? (
          <p className="text-sm text-slate-700">
            No saved scholarships yet.{" "}
            <Link href="/scholarships" className="text-accent-blue underline">
              Browse the catalogue
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {state.data.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between">
                <span className="font-medium text-slate-900">{item.scheme_name}</span>
                <span className="text-slate-600">
                  Saved {formatDate(item.saved_at) ?? "date not recorded"}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Card>
  );
}
