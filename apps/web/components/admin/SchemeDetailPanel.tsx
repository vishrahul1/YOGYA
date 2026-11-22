"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import { VersionsPanel } from "@/components/admin/VersionsPanel";
import { blankToNull, schemeStatusLabel } from "@/components/admin/labels";
import { apiRequest } from "@/lib/api/client";
import type { AdminScheme, SchemeUpdateRequest } from "@/lib/api/adminTypes";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import { useAuth } from "@/lib/auth/session";

export interface SchemeDetailPanelProps {
  schemeId: string;
}

export default function SchemeDetailPanel({ schemeId }: SchemeDetailPanelProps) {
  const path = `/api/admin/schemes/${encodeURIComponent(schemeId)}`;
  const { data, error, loading, reload } = useAuthedRequest<AdminScheme>(
    path,
    "Could not load this scheme. It may not exist.",
  );

  if (loading && data === null && !error) {
    return <Spinner label="Loading scheme" />;
  }
  if (error) {
    return <ErrorMessage message={error} />;
  }
  if (data === null) {
    return null;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
        <p className="text-sm text-slate-600">
          Status: {schemeStatusLabel(data.status)} · Slug: {data.slug}
          {data.issuing_body ? ` · Issuing body: ${data.issuing_body}` : ""}
        </p>
      </header>

      <Card>
        <SchemeEditForm scheme={data} onSaved={reload} />
      </Card>

      <VersionsPanel schemeId={data.id} schemeName={data.name} />
    </div>
  );
}

interface SchemeEditFormProps {
  scheme: AdminScheme;
  onSaved: () => void;
}

/** Edits name and issuing body only. Status and slug are not changed here. */
function SchemeEditForm({ scheme, onSaved }: SchemeEditFormProps) {
  const { session } = useAuth();
  const [name, setName] = useState(scheme.name);
  const [issuingBody, setIssuingBody] = useState(scheme.issuing_body ?? "");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setSaved(false);
    setSubmitError(null);
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setNameError("Enter the scheme name.");
      return;
    }
    if (trimmedName.length > 200 || issuingBody.trim().length > 200) {
      setSubmitError("Name and issuing body must be 200 characters or fewer.");
      return;
    }
    setNameError(undefined);

    const body: SchemeUpdateRequest = {
      name: trimmedName,
      issuing_body: blankToNull(issuingBody),
    };
    setBusy(true);
    try {
      await apiRequest<AdminScheme>(`/api/admin/schemes/${encodeURIComponent(scheme.id)}`, {
        method: "PATCH",
        token: session.access_token,
        body,
      });
      setSaved(true);
      onSaved();
    } catch {
      setSubmitError("Could not save changes. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Edit scheme">
      <h2 className="text-lg font-semibold text-slate-900">Scheme details</h2>
      <Input
        label="Scheme name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        maxLength={200}
        required
      />
      <Input
        label="Issuing body (optional)"
        name="issuing_body"
        value={issuingBody}
        onChange={(e) => setIssuingBody(e.target.value)}
        maxLength={200}
      />
      {submitError ? <ErrorMessage message={submitError} /> : null}
      {saved ? (
        <p role="status" className="text-sm text-emerald-800">
          Changes saved.
        </p>
      ) : null}
      <Button type="submit" disabled={busy || !session}>
        {busy ? "Saving..." : "Save details"}
      </Button>
    </form>
  );
}
