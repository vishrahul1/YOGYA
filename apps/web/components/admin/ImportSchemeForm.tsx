"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import { HTTPS_URL_PATTERN, blankToNull } from "@/components/admin/labels";
import { ApiError, apiRequest } from "@/lib/api/client";
import type { ImportUrlRequest, ImportUrlResponse } from "@/lib/api/adminTypes";
import { useAuth } from "@/lib/auth/session";

interface ImportErrors {
  official_url?: string;
  name?: string;
  issuing_body?: string;
}

/**
 * Creates a candidate scheme from an official URL. The backend makes NO request to the URL.
 * The record is created as an unverified draft and must be checked by an admin.
 */
export default function ImportSchemeForm() {
  const { session } = useAuth();
  const [officialUrl, setOfficialUrl] = useState("");
  const [name, setName] = useState("");
  const [issuingBody, setIssuingBody] = useState("");
  const [errors, setErrors] = useState<ImportErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<ImportUrlResponse | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): ImportErrors {
    const next: ImportErrors = {};
    const url = officialUrl.trim();
    if (url.length === 0) {
      next.official_url = "Enter the official https:// link.";
    } else if (url.length > 2000) {
      next.official_url = "The link must be 2000 characters or fewer.";
    } else if (!HTTPS_URL_PATTERN.test(url)) {
      next.official_url = "The link must start with https:// and include a domain.";
    }
    if (name.trim().length > 200) {
      next.name = "Name must be 200 characters or fewer.";
    }
    if (issuingBody.trim().length > 200) {
      next.issuing_body = "Issuing body must be 200 characters or fewer.";
    }
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setSubmitError(null);
    setCreated(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const body: ImportUrlRequest = {
      official_url: officialUrl.trim(),
      name: blankToNull(name),
      issuing_body: blankToNull(issuingBody),
    };
    setBusy(true);
    try {
      const result = await apiRequest<ImportUrlResponse>("/api/admin/schemes/import-url", {
        method: "POST",
        token: session.access_token,
        body,
      });
      setCreated(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError("A scheme with a matching slug already exists. Try adding a name.");
      } else {
        setSubmitError("Could not record the import. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p
        role="note"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        The URL is not fetched. YOGYA only records it. The scheme is created as an unverified draft
        and stays unverified until an admin checks the official page and verifies a source.
      </p>
      <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Import scheme from URL">
        <Input
          label="Official URL"
          name="official_url"
          type="url"
          value={officialUrl}
          onChange={(e) => setOfficialUrl(e.target.value)}
          error={errors.official_url}
          maxLength={2000}
          required
        />
        <Input
          label="Scheme name (optional)"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={200}
        />
        <Input
          label="Issuing body (optional)"
          name="issuing_body"
          value={issuingBody}
          onChange={(e) => setIssuingBody(e.target.value)}
          error={errors.issuing_body}
          maxLength={200}
        />
        {submitError ? <ErrorMessage message={submitError} /> : null}
        <Button type="submit" variant="secondary" disabled={busy || !session}>
          {busy ? "Recording..." : "Record unverified import"}
        </Button>
      </form>

      {created ? (
        <p role="status" className="text-sm text-emerald-800">
          Recorded as an unverified draft.{" "}
          <Link href={`/admin/schemes/${created.scheme_id}`} className="underline">
            Open the scheme
          </Link>
        </p>
      ) : null}
    </div>
  );
}
