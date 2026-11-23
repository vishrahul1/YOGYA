"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import VersionContentEditor from "@/components/admin/VersionContentEditor";
import { SOURCE_URL_PATTERN, blankToNull } from "@/components/admin/labels";
import { formatDate } from "@/lib/scholarships/format";
import { ApiError, apiRequest } from "@/lib/api/client";
import type {
  ReasonRequest,
  SchemeSource,
  SchemeVersion,
  SourceCreateRequest,
  VersionHistoryItem,
  VersionHistoryResponse,
} from "@/lib/api/adminTypes";
import { useAuth } from "@/lib/auth/session";

/**
 * A version this browser session knows about. `version` is null when the id was entered by hand,
 * because the backend has no route that returns one version's status on its own.
 */
export interface ManagedVersion {
  id: string;
  version: SchemeVersion | null;
}

export interface VersionCardProps {
  managed: ManagedVersion;
  sources: SchemeSource[];
  onVersionChange: (version: SchemeVersion) => void;
  onSourceAdded: (source: SchemeSource) => void;
  onSourceVerified: (source: SchemeSource) => void;
  onPublished: (version: SchemeVersion) => void;
}

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.message) return err.message;
  return "Could not complete this action. Please try again.";
}

export default function VersionCard({
  managed,
  sources,
  onVersionChange,
  onSourceAdded,
  onSourceVerified,
  onPublished,
}: VersionCardProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const versionId = managed.id;
  const status = managed.version?.status ?? null;
  const basePath = `/api/admin/scheme-versions/${encodeURIComponent(versionId)}`;

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  const [history, setHistory] = useState<VersionHistoryItem[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceAuthority, setSourceAuthority] = useState("");
  const [sourceNotes, setSourceNotes] = useState("");
  const [sourceErrors, setSourceErrors] = useState<{ url?: string; authority?: string; notes?: string }>(
    {},
  );

  // Action availability mirrors the backend's status checks. The backend still enforces them.
  const canAddSource = status === null || status === "draft" || status === "in_review";
  const canVerifySource = status === "draft" || status === "in_review";
  const canSubmit = status === "draft";
  const canApprove = status === "in_review";
  const canReject = status === "in_review";
  const canPublish = status === "verified";

  async function loadHistory(): Promise<void> {
    setHistoryError(null);
    try {
      const res = await apiRequest<VersionHistoryResponse>(`${basePath}/history`, { token });
      setHistory(res.items);
    } catch {
      setHistoryError("Could not load the verification history.");
    }
  }

  async function afterChange(): Promise<void> {
    if (historyOpen) await loadHistory();
  }

  function toggleHistory() {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    void loadHistory();
  }

  async function runVersionAction(
    key: string,
    action: "submit-review" | "approve" | "publish",
    onDone: (version: SchemeVersion) => void,
    note: string,
  ): Promise<void> {
    if (!token) return;
    setBusy(key);
    setActionError(null);
    setActionNote(null);
    try {
      const version = await apiRequest<SchemeVersion>(`${basePath}/${action}`, {
        method: "POST",
        token,
      });
      onDone(version);
      setActionNote(note);
      await afterChange();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError("Enter a reason for rejecting this version.");
      return;
    }
    if (trimmed.length > 1000) {
      setReasonError("The reason must be 1000 characters or fewer.");
      return;
    }
    setReasonError(undefined);
    setBusy("reject");
    setActionError(null);
    setActionNote(null);
    const body: ReasonRequest = { reason: trimmed };
    try {
      const version = await apiRequest<SchemeVersion>(`${basePath}/reject`, {
        method: "POST",
        token,
        body,
      });
      onVersionChange(version);
      setRejecting(false);
      setReason("");
      setActionNote("Rejected and returned to draft.");
      await afterChange();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish(): Promise<void> {
    if (!token) return;
    setBusy("publish");
    setActionError(null);
    setActionNote(null);
    try {
      const version = await apiRequest<SchemeVersion>(`${basePath}/publish`, {
        method: "POST",
        token,
      });
      setConfirmingPublish(false);
      onPublished(version);
      await afterChange();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleVerifySource(source: SchemeSource): Promise<void> {
    if (!token) return;
    setBusy(`verify-${source.id}`);
    setActionError(null);
    setActionNote(null);
    try {
      const updated = await apiRequest<SchemeSource>(
        `${basePath}/sources/${encodeURIComponent(source.id)}/verify`,
        { method: "POST", token },
      );
      onSourceVerified(updated);
      setActionNote("Source verified.");
      await afterChange();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleAddSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const url = sourceUrl.trim();
    const authority = sourceAuthority.trim();
    const notes = sourceNotes.trim();
    const next: { url?: string; authority?: string; notes?: string } = {};
    if (url.length < 9 || !SOURCE_URL_PATTERN.test(url)) {
      next.url = "Enter the official https:// link to the source.";
    } else if (url.length > 2000) {
      next.url = "The link must be 2000 characters or fewer.";
    }
    if (authority.length === 0) {
      next.authority = "Enter the issuing authority.";
    } else if (authority.length > 200) {
      next.authority = "The issuing authority must be 200 characters or fewer.";
    }
    if (notes.length > 1000) {
      next.notes = "Notes must be 1000 characters or fewer.";
    }
    setSourceErrors(next);
    if (Object.keys(next).length > 0) return;

    const body: SourceCreateRequest = {
      official_url: url,
      issuing_authority: authority,
      notes: blankToNull(notes),
    };
    setBusy("add-source");
    setActionError(null);
    setActionNote(null);
    try {
      const source = await apiRequest<SchemeSource>(`${basePath}/sources`, {
        method: "POST",
        token,
        body,
      });
      onSourceAdded(source);
      setSourceUrl("");
      setSourceAuthority("");
      setSourceNotes("");
      setActionNote("Source added. Verify it once you have checked the official page.");
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const heading = managed.version
    ? `Academic year ${managed.version.academic_year}`
    : "Scholarship details";
  const publishedOn = formatDate(managed.version?.published_at ?? null);
  const verifiedOn = formatDate(managed.version?.verified_at ?? null);
  const isPublished = status === "published";
  const nextActionText = status === "draft"
    ? "Complete the information and verify an official source before submitting."
    : status === "in_review"
      ? "Review the evidence, then approve or return the version for corrections."
      : status === "verified"
        ? "Verification is complete. Publish when this version is ready for students."
        : status === "published"
          ? "This scholarship is live in the student catalogue."
          : "No action is available for this scholarship.";

  return (
    <article className="border-t border-slate-300 pt-6">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Scholarship workflow</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">{heading}</h3>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isPublished ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {isPublished ? "Published" : "Draft"}
          </span>
        </div>
        <ol className="mt-6 grid grid-cols-2" aria-label="Publishing progress">
          <li className="relative flex items-center gap-3 border-t-2 border-teal-600 pt-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">1</span>
            <span><span className="block text-xs font-bold uppercase tracking-wide text-teal-700">Draft</span><span className="block font-semibold text-slate-950">Complete required checks</span></span>
          </li>
          <li className={`flex items-center gap-3 border-t-2 pt-4 ${isPublished ? "border-emerald-600" : "border-slate-200"}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${isPublished ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-500"}`}>2</span>
            <span><span className={`block text-xs font-bold uppercase tracking-wide ${isPublished ? "text-emerald-700" : "text-slate-400"}`}>Published</span><span className={`block font-semibold ${isPublished ? "text-emerald-900" : "text-slate-500"}`}>Available to students</span></span>
          </li>
        </ol>
      </header>

      <div className="space-y-6 py-6">
      <div className="space-y-1">
        {verifiedOn ? <p className="text-sm text-slate-600">Verified on {verifiedOn}</p> : null}
        {publishedOn ? <p className="text-sm text-slate-600">Published on {publishedOn}</p> : null}
        {managed.version === null ? (
          <p className="text-sm text-amber-800">
            The scholarship status has not been returned yet. Status-dependent actions are hidden
            until an action on it returns its status.
          </p>
        ) : null}
      </div>

      {actionError ? <ErrorMessage message={actionError} /> : null}
      {actionNote ? (
        <p role="status" className="text-sm text-emerald-800">
          {actionNote}
        </p>
      ) : null}

      {managed.version ? (
        <details className="group border-b border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-950">
            <span>Scholarship information</span>
            <span className="text-xl font-normal text-slate-400 group-open:rotate-45">+</span>
          </summary>
          <div className="pb-5"><VersionContentEditor versionId={versionId} status={managed.version.status} sources={sources} /></div>
        </details>
      ) : null}

      <section className="border-l-4 border-teal-600 py-1 pl-4" aria-label="Next verification action">
        <h4 className="mb-1 font-semibold text-slate-950">Next action</h4>
        <p className="mb-3 text-sm text-slate-700">{nextActionText}</p>
      <div className="flex flex-wrap gap-2">
        {canSubmit ? (
          <Button
            variant="secondary"
            onClick={() => runVersionAction("submit", "submit-review", onVersionChange, "Submitted for review.")}
            disabled={busy !== null}
          >
            {busy === "submit" ? "Submitting..." : "Submit for review"}
          </Button>
        ) : null}
        {canApprove ? (
          <Button
            onClick={() => runVersionAction("approve", "approve", onVersionChange, "Approved and verified.")}
            disabled={busy !== null}
          >
            {busy === "approve" ? "Approving..." : "Approve"}
          </Button>
        ) : null}
        {canReject && !rejecting ? (
          <Button variant="secondary" onClick={() => setRejecting(true)} disabled={busy !== null}>
            Reject
          </Button>
        ) : null}
        {canPublish && !confirmingPublish ? (
          <Button onClick={() => setConfirmingPublish(true)} disabled={busy !== null}>
            Publish
          </Button>
        ) : null}
      </div>

      {confirmingPublish ? (
        <div role="group" aria-label="Confirm publish" className="space-y-2 rounded-lg border border-slate-300 p-4">
          <p className="text-sm text-slate-800">
            Publish this scholarship to the public catalogue?
          </p>
          <div className="flex gap-2">
            <Button onClick={handlePublish} disabled={busy !== null}>
              {busy === "publish" ? "Publishing..." : "Confirm publish"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingPublish(false)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {rejecting ? (
        <form onSubmit={handleReject} noValidate className="space-y-3 rounded-lg border border-slate-300 p-4" aria-label="Reject version">
          <div className="flex flex-col gap-1">
            <label htmlFor={`reason-${versionId}`} className="text-sm font-medium text-slate-700">
              Reason for rejection
            </label>
            <textarea
              id={`reason-${versionId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `reason-${versionId}-error` : undefined}
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            />
            {reasonError ? (
              <p id={`reason-${versionId}-error`} className="text-sm text-red-700">
                {reasonError}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy !== null}>
              {busy === "reject" ? "Rejecting..." : "Confirm reject"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setRejecting(false);
                setReasonError(undefined);
              }}
              disabled={busy !== null}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <details className="group border-b border-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-950">
          <span>Official sources <span className="ml-2 text-xs font-normal text-slate-500">{sources.length} added</span></span>
          <span className="text-xl font-normal text-slate-400 group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-5 pb-5">
      {sources.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-900">Sources on this scheme</h4>
          <ul className="space-y-2">
            {sources.map((source) => {
              const verified = formatDate(source.verified_at);
              return (
                <li key={source.id} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-all text-slate-800">
                    {source.issuing_authority}:{" "}
                    <a href={source.official_url} target="_blank" rel="noreferrer" className="font-medium text-teal-700 underline underline-offset-2">{source.official_url}</a>
                    {verified ? ` (verified ${verified})` : " (not verified)"}
                  </span>
                  {canVerifySource && source.verified_at === null ? (
                    <Button
                      variant="secondary"
                      onClick={() => handleVerifySource(source)}
                      disabled={busy !== null}
                    >
                      {busy === `verify-${source.id}` ? "Verifying..." : "Verify source"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {canAddSource ? (
        <details className="border-t border-slate-200 pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-teal-700">+ Add another official source</summary>
        <form onSubmit={handleAddSource} noValidate className="mt-4 grid gap-3 md:grid-cols-2" aria-label="Add source">
          <Input
            label="Official source URL"
            name="source_url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            error={sourceErrors.url}
            maxLength={2000}
            required
          />
          <Input
            label="Issuing authority"
            name="issuing_authority"
            value={sourceAuthority}
            onChange={(e) => setSourceAuthority(e.target.value)}
            error={sourceErrors.authority}
            maxLength={200}
            required
          />
          <Input
            label="Notes (optional)"
            name="source_notes"
            value={sourceNotes}
            onChange={(e) => setSourceNotes(e.target.value)}
            error={sourceErrors.notes}
            maxLength={1000}
          />
          <div className="md:col-span-2"><Button type="submit" variant="secondary" disabled={busy !== null}>
            {busy === "add-source" ? "Adding..." : "Add source"}
          </Button></div>
        </form>
        </details>
      ) : null}
        </div>
      </details>

      <div>
        <Button variant="secondary" onClick={toggleHistory} aria-expanded={historyOpen}>
          Verification history
        </Button>
      </div>
      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby={`history-${versionId}`}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h4 id={`history-${versionId}`} className="text-xl font-semibold text-slate-950">Verification history</h4>
              <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>
            </div>
            {historyError ? <ErrorMessage message={historyError} /> : null}
            {history === null && !historyError ? <Spinner label="Loading verification history" /> : null}
            {history !== null ? (
              history.length === 0 ? <p className="text-sm text-slate-600">No verification history yet.</p> : (
                <ol className="space-y-2 text-sm text-slate-800">
                  {history.map((item) => (
                    <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <span className="font-medium">{item.action}</span>
                      {formatDate(item.recorded_at) ? ` · ${formatDate(item.recorded_at)}` : ""}
                      {item.note ? <p className="mt-1 text-slate-600">{item.note}</p> : null}
                    </li>
                  ))}
                </ol>
              )
            ) : null}
          </div>
        </div>
      ) : null}
      </section>
      </div>
    </article>
  );
}
