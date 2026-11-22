"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { deleteAuthed } from "@/components/tracking/trackingApi";
import { usePublicSchemes } from "@/components/tracking/usePublicSchemes";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import type { SavedSchemeListResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/session";
import { formatDate } from "@/lib/scholarships/format";

const LOAD_FAILED = "Could not load your saved scholarships. Please try again later.";

export default function SavedSchemesList() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { data, error, loading, reload } = useAuthedRequest<SavedSchemeListResponse>(
    "/api/student/saved-schemes",
    LOAD_FAILED,
  );
  const catalogue = usePublicSchemes();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleRemove(savedId: string) {
    if (!token) return;
    setBusyId(savedId);
    setActionError(null);
    try {
      await deleteAuthed(`/api/student/saved-schemes/${encodeURIComponent(savedId)}`, token);
      reload();
    } catch {
      setActionError("Could not remove this scholarship. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && data === null && !error) {
    return <Spinner label="Loading saved scholarships" />;
  }
  if (error) {
    return <ErrorMessage message={error} />;
  }
  if (data === null || data.items.length === 0) {
    return (
      <EmptyState
        title="No saved scholarships yet"
        description="Open a scholarship from the catalogue and select Save to keep it here."
        action={
          <Link href="/scholarships" className="text-accent-blue underline">
            Browse scholarships
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {actionError ? <ErrorMessage message={actionError} /> : null}
      <ul className="space-y-4">
        {data.items.map((item) => {
          const match = catalogue.items?.find((s) => s.scheme_id === item.scheme_id) ?? null;
          const saved = formatDate(item.saved_at);
          return (
            <li key={item.id}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">{item.scheme_name}</h2>
                  {saved ? <p className="text-sm text-slate-600">Saved on {saved}</p> : null}
                  {match ? (
                    <Link
                      href={`/scholarships/${match.scheme_version_id}`}
                      className="text-sm text-accent-blue underline"
                    >
                      View scholarship details
                    </Link>
                  ) : catalogue.loading ? null : (
                    <p className="text-sm text-slate-600">
                      Details are not available in the catalogue right now.
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => handleRemove(item.id)}
                  disabled={busyId === item.id}
                  aria-label={`Remove ${item.scheme_name} from saved scholarships`}
                >
                  {busyId === item.id ? "Removing..." : "Remove"}
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
