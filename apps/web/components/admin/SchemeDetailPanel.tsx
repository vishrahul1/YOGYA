"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import { VersionsPanel } from "@/components/admin/VersionsPanel";
import { blankToNull, schemeStatusLabel } from "@/components/admin/labels";
import { ApiError, apiRequest } from "@/lib/api/client";
import type { AdminScheme, SchemeUpdateRequest } from "@/lib/api/adminTypes";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import { useAuth } from "@/lib/auth/session";

export interface SchemeDetailPanelProps {
  schemeId: string;
}

export default function SchemeDetailPanel({ schemeId }: SchemeDetailPanelProps) {
  const [editingDetails, setEditingDetails] = useState(false);
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
      <header className="border-b border-slate-300 pb-6 sm:flex sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{schemeStatusLabel(data.status)}</span>
            <span className="text-xs font-medium text-slate-500">{data.slug}</span>
          </div>
          <h1 className="mt-3 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-slate-950">{data.name}</h1>
          {data.issuing_body ? <p className="mt-2 text-sm text-slate-600">{data.issuing_body}</p> : null}
        </div>
        <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
          <button type="button" onClick={() => setEditingDetails(true)} className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit details</button>
          <Link href="/admin" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">← Back</Link>
        </div>
      </header>

      {editingDetails ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-scheme-heading">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id="edit-scheme-heading" className="text-xl font-semibold text-slate-950">Edit scholarship details</h2>
              <button type="button" onClick={() => setEditingDetails(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>
            </div>
            <SchemeEditForm scheme={data} onSaved={() => { reload(); setEditingDetails(false); }} />
          </div>
        </div>
      ) : null}

      <VersionsPanel schemeId={data.id} schemeName={data.name} />

      <DeleteSchemeControl scheme={data} />
    </div>
  );
}

function DeleteSchemeControl({ scheme }: { scheme: AdminScheme }) {
  const { session } = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!session || confirmation !== scheme.name) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest<{ deleted: boolean }>(`/api/admin/schemes/${encodeURIComponent(scheme.id)}`, {
        method: "DELETE",
        token: session.access_token,
      });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this scholarship.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-slate-200 pt-6" aria-labelledby="delete-scholarship-heading">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 id="delete-scholarship-heading" className="font-semibold text-slate-950">Delete scholarship</h2>
          <p className="mt-1 text-sm text-slate-600">Available only while every version is still a draft and no student activity exists.</p>
        </div>
        {!confirming ? <Button variant="danger" onClick={() => setConfirming(true)}>Delete scholarship</Button> : null}
      </div>

      {confirming ? (
        <div className="mt-5 max-w-xl border-l-4 border-red-600 bg-red-50 p-4">
          <p className="text-sm text-red-950">This permanently removes the draft, its versions, sources, documents, and eligibility rules.</p>
          <p className="mt-3 text-sm font-medium text-red-950">Type <strong>{scheme.name}</strong> to confirm.</p>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-slate-950" aria-label="Type scholarship name to confirm deletion" />
          {error ? <div className="mt-3"><ErrorMessage message={error} /></div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => void handleDelete()} disabled={busy || confirmation !== scheme.name}>{busy ? "Deleting..." : "Permanently delete"}</Button>
            <Button variant="secondary" onClick={() => { setConfirming(false); setConfirmation(""); setError(null); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </section>
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
