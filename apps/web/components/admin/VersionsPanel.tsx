"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import VersionCard from "@/components/admin/VersionCard";
import type { ManagedVersion } from "@/components/admin/VersionCard";
import { ACADEMIC_YEAR_PATTERN, UUID_PATTERN } from "@/components/admin/labels";
import { ApiError, apiRequest } from "@/lib/api/client";
import type {
  SchemeSource,
  SchemeVersion,
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

  const [academicYear, setAcademicYear] = useState("");
  const [yearError, setYearError] = useState<string | undefined>(undefined);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [manualId, setManualId] = useState("");
  const [manualError, setManualError] = useState<string | undefined>(undefined);

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

  function handleAddById(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = manualId.trim();
    if (!UUID_PATTERN.test(id)) {
      setManualError("Enter a version ID in the usual UUID format.");
      return;
    }
    if (versions.some((m) => m.id === id)) {
      setManualError("This version is already listed below.");
      return;
    }
    setManualError(undefined);
    setVersions((prev) => [{ id, version: null }, ...prev]);
    setManualId("");
  }

  return (
    <section aria-labelledby="versions-heading" className="space-y-6">
      <h2 id="versions-heading" className="text-xl font-semibold text-slate-900">
        Versions and verification
      </h2>

      <p className="text-sm text-slate-600">
        The backend does not provide a list of versions for a scheme. Only versions created or
        added by ID in this visit appear below. Refreshing the page clears this list.
      </p>

      <form onSubmit={handleAddVersion} noValidate className="space-y-3" aria-label="Add version">
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

      <form onSubmit={handleAddById} noValidate className="space-y-3" aria-label="Add existing version by ID">
        <Input
          label="Existing version ID"
          name="version_id"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          error={manualError}
        />
        <Button type="submit" variant="secondary">
          Add version by ID
        </Button>
      </form>

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

      {versions.length === 0 ? (
        <p className="text-sm text-slate-600">No versions in this session yet.</p>
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
