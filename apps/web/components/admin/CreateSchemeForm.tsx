"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import { SLUG_PATTERN, blankToNull } from "@/components/admin/labels";
import { ApiError, apiRequest } from "@/lib/api/client";
import type { AdminScheme, SchemeCreateRequest } from "@/lib/api/adminTypes";
import { useAuth } from "@/lib/auth/session";

interface CreateErrors {
  slug?: string;
  name?: string;
  issuing_body?: string;
}

/** Creates a catalogue scheme as a draft. The backend always starts it at status 'draft'. */
export default function CreateSchemeForm() {
  const { session } = useAuth();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [issuingBody, setIssuingBody] = useState("");
  const [errors, setErrors] = useState<CreateErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminScheme | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): CreateErrors {
    const next: CreateErrors = {};
    const trimmedSlug = slug.trim();
    if (trimmedSlug.length === 0) {
      next.slug = "Enter a slug.";
    } else if (trimmedSlug.length > 100) {
      next.slug = "Slug must be 100 characters or fewer.";
    } else if (!SLUG_PATTERN.test(trimmedSlug)) {
      next.slug = "Use lowercase letters, numbers and single hyphens only, for example 'telangana-post-matric'.";
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      next.name = "Enter the scheme name.";
    } else if (trimmedName.length > 200) {
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

    const body: SchemeCreateRequest = {
      slug: slug.trim(),
      name: name.trim(),
      issuing_body: blankToNull(issuingBody),
    };
    setBusy(true);
    try {
      const scheme = await apiRequest<AdminScheme>("/api/admin/schemes", {
        method: "POST",
        token: session.access_token,
        body,
      });
      setCreated(scheme);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ slug: "This slug is already in use. Choose another." });
      } else {
        setSubmitError("Could not create the scheme. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Create scheme">
        <Input
          label="Slug"
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          error={errors.slug}
          autoComplete="off"
          maxLength={100}
          required
        />
        <Input
          label="Scheme name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={200}
          required
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
        <Button type="submit" disabled={busy || !session}>
          {busy ? "Creating..." : "Create draft scheme"}
        </Button>
      </form>

      {created ? (
        <p role="status" className="text-sm text-emerald-800">
          Created as a draft. <Link href={`/admin/schemes/${created.id}`} className="underline">Open {created.name}</Link>
        </p>
      ) : null}
    </div>
  );
}
