"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import VersionCard from "@/components/admin/VersionCard";
import type { ManagedVersion } from "@/components/admin/VersionCard";
import { ACADEMIC_YEAR_PATTERN } from "@/components/admin/labels";
import { ApiError, apiRequest } from "@/lib/api/client";
import type {
  SchemeSource,
  SchemeSourceListResponse,
  SchemeVersion,
  SchemeVersionListResponse,
  VersionCreateRequest,
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

  const [academicYear, setAcademicYear] = useState("");
  const [yearError, setYearError] = useState<string | undefined>(undefined);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoadingWorkspace(true);
    setWorkspaceError(null);
    Promise.all([
      apiRequest<SchemeVersionListResponse>(
        `/api/admin/schemes/${encodeURIComponent(schemeId)}/versions`,
        { token },
      ),
      apiRequest<SchemeSourceListResponse>(
        `/api/admin/schemes/${encodeURIComponent(schemeId)}/sources`,
        { token },
      ),
    ])
      .then(([versionResult, sourceResult]) => {
        if (!active) return;
        setVersions(versionResult.items.map((version) => ({ id: version.id, version })));
        setSources(sourceResult.items);
      })
      .catch(() => {
        if (active) setWorkspaceError("Could not load versions and official sources.");
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

  async function handleAddVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const year = academicYear.trim();
    if (!ACADEMIC_YEAR_PATTERN.test(year)) {
      setYearError("Use the academic year format 2025-26.");
      return;
    }
    setYearError(undefined);
    setAddError(null);
    const body: VersionCreateRequest = { academic_year: year };
    setAdding(true);
    try {
      const version = await apiRequest<SchemeVersion>(
        `/api/admin/schemes/${encodeURIComponent(schemeId)}/versions`,
        { method: "POST", token, body },
      );
      setVersions((prev) => [{ id: version.id, version }, ...prev]);
      setAcademicYear("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setAddError(err.message);
      } else {
        setAddError("Could not add the version. Please try again.");
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <section aria-labelledby="versions-heading" className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Step 2 of 2</p>
        <h2 id="versions-heading" className="mt-1 text-2xl font-semibold text-slate-950">Review and publish</h2>
        <p className="mt-2 text-sm text-slate-600">Check the information and source, then move the version through review.</p>
      </div>

      {loadingWorkspace ? <Spinner label="Loading versions and sources" /> : null}
      {workspaceError ? <ErrorMessage message={workspaceError} /> : null}

      <details className="border-b border-slate-200 pb-4" open={!loadingWorkspace && versions.length === 0}>
        <summary className="cursor-pointer py-2 text-sm font-semibold text-teal-700">+ Add another academic-year version</summary>
      <form onSubmit={handleAddVersion} noValidate className="mt-3 max-w-md space-y-3" aria-label="Add version">
        <Input
          label="New academic year version"
          name="academic_year"
          placeholder="2025-26"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          error={yearError}
          maxLength={7}
        />
        {addError ? <ErrorMessage message={addError} /> : null}
        <Button type="submit" variant="secondary" disabled={adding || !token}>
          {adding ? "Adding..." : "Add version as draft"}
        </Button>
      </form>
      </details>

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
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No versions yet. Add the first academic-year version above.</p>
      ) : (
        <div className="space-y-4">
          {versions.map((managed) => (
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
