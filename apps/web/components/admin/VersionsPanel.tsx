"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import VersionCard from "@/components/admin/VersionCard";
import type { ManagedVersion } from "@/components/admin/VersionCard";
import { apiRequest } from "@/lib/api/client";
import type {
  SchemeSource,
  SchemeSourceListResponse,
  SchemeVersion,
} from "@/lib/api/adminTypes";
import type { SchemeListResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/session";

export interface VersionsPanelProps {
  schemeId: string;
  schemeName: string;
}

type PublicListing = "checking" | "listed" | "not_listed" | "unknown";

interface PublicationState {
  versionId: string;
  listing: PublicListing;
}

const LISTING_TEXT: Record<PublicListing, string> = {
  checking: "Checking the public catalogue...",
  listed: "Confirmed: this scheme appears in the public catalogue.",
  not_listed: "This scheme does not appear in the public catalogue yet.",
  unknown: "Could not check the public catalogue right now.",
};

export function VersionsPanel({ schemeId, schemeName }: VersionsPanelProps) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [versions, setVersions] = useState<ManagedVersion[]>([]);
  const [sources, setSources] = useState<SchemeSource[]>([]);
  const [publication, setPublication] = useState<PublicationState | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);


  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoadingWorkspace(true);
    setWorkspaceError(null);
    Promise.all([
      apiRequest<SchemeVersion>(
        `/api/admin/schemes/${encodeURIComponent(schemeId)}/record`,
        { token },
      ),
      apiRequest<SchemeSourceListResponse>(
        `/api/admin/schemes/${encodeURIComponent(schemeId)}/sources`,
        { token },
      ),
    ])
      .then(([versionResult, sourceResult]) => {
        if (!active) return;
        setVersions([{ id: versionResult.id, version: versionResult }]);
        setSources(sourceResult.items);
      })
      .catch(() => {
        if (active) setWorkspaceError("Could not load the scholarship workspace and official sources.");
      })
      .finally(() => {
        if (active) setLoadingWorkspace(false);
      });
    return () => {
      active = false;
    };
  }, [schemeId, token]);

  function upsertVersion(version: SchemeVersion): void {
    setVersions((prev) =>
      prev.map((m) => (m.id === version.id ? { id: version.id, version } : m)),
    );
  }

  async function checkPublicCatalogue(versionId: string, name: string): Promise<void> {
    try {
      const res = await apiRequest<SchemeListResponse>(
        `/api/schemes?limit=100&offset=0&q=${encodeURIComponent(name)}`,
      );
      const listed = res.items.some((item) => item.scheme_version_id === versionId);
      setPublication({ versionId, listing: listed ? "listed" : "not_listed" });
    } catch {
      setPublication({ versionId, listing: "unknown" });
    }
  }

  function handlePublished(version: SchemeVersion): void {
    upsertVersion(version);
    setPublication({ versionId: version.id, listing: "checking" });
    void checkPublicCatalogue(version.id, schemeName);
  }

  return (
    <section aria-labelledby="versions-heading" className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-300 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="versions-heading" className="text-xl font-semibold text-slate-950">Draft and publish</h2>
          <p className="mt-1 text-sm text-slate-600">Complete required checks, then publish for students.</p>
        </div>
      </div>

      {loadingWorkspace ? <Spinner label="Loading scholarship workspace" /> : null}
      {workspaceError ? <ErrorMessage message={workspaceError} /> : null}

      {publication ? (
        <div
          role="status"
          className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <p className="font-medium">Published. Check the public catalogue.</p>
          <Link
            href={`/scholarships/${publication.versionId}`}
            className="font-medium text-accent-blue underline"
          >
            Open the public scholarship page
          </Link>
          <p>{LISTING_TEXT[publication.listing]}</p>
        </div>
      ) : null}

      {!loadingWorkspace && versions.length === 0 ? (
        <p className="border-l-4 border-amber-400 pl-4 text-sm text-slate-600">The scholarship workspace is unavailable.</p>
      ) : (
        <div>
          {versions.slice(0, 1).map((managed) => (
            <VersionCard
              key={managed.id}
              managed={managed}
              sources={sources}
              onVersionChange={upsertVersion}
              onSourceAdded={(source) => setSources((prev) => [source, ...prev])}
              onSourceVerified={(source) =>
                setSources((prev) => prev.map((s) => (s.id === source.id ? source : s)))
              }
              onPublished={handlePublished}
            />
          ))}
        </div>
      )}
    </section>
  );
}
