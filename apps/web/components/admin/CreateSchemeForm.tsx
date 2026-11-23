"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import { ACADEMIC_YEAR_PATTERN, SLUG_PATTERN, SOURCE_URL_PATTERN, blankToNull } from "@/components/admin/labels";
import { ApiError, apiRequest } from "@/lib/api/client";
import type { AdminScheme, SchemeSource, SchemeVersion, VersionContent } from "@/lib/api/adminTypes";
import { useAuth } from "@/lib/auth/session";

const OPERATORS = ["eq", "neq", "lt", "lte", "gt", "gte", "in", "not_in", "between", "is_set"] as const;
type Operator = (typeof OPERATORS)[number];
type Criterion = { attribute: string; operator: Operator; value: string };
type Errors = Partial<Record<"name" | "slug" | "authority" | "year" | "url" | "dates", string>>;

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

function criterionValue(criterion: Criterion): unknown {
  if (criterion.operator === "is_set") return null;
  if (criterion.operator === "in" || criterion.operator === "not_in") {
    return criterion.value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (criterion.operator === "between") {
    return criterion.value.split(",").map((item) => Number(item.trim()));
  }
  const numeric = Number(criterion.value);
  return criterion.value.trim() !== "" && Number.isFinite(numeric) ? numeric : criterion.value.trim();
}

export default function CreateSchemeForm() {
  const { session } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [authority, setAuthority] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceNotes, setSourceNotes] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [benefit, setBenefit] = useState("");
  const [deadline, setDeadline] = useState("");
  const [documents, setDocuments] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [partialScheme, setPartialScheme] = useState<AdminScheme | null>(null);
  const [busy, setBusy] = useState(false);

  function changeName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter the scholarship name.";
    if (!SLUG_PATTERN.test(slug.trim())) next.slug = "Use lowercase letters, numbers and single hyphens.";
    if (!authority.trim()) next.authority = "Enter the issuing authority.";
    if (!ACADEMIC_YEAR_PATTERN.test(academicYear.trim())) next.year = "Use the format 2026-27.";
    if (!SOURCE_URL_PATTERN.test(sourceUrl.trim())) next.url = "Enter an official https:// source link.";
    if (startDate && endDate && startDate > endDate) next.dates = "The opening date must be before the closing date.";
    return next;
  }

  function updateCriterion(index: number, change: Partial<Criterion>) {
    setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setSubmitError(null);
    setPartialScheme(null);
    let scheme: AdminScheme | null = null;
    try {
      scheme = await apiRequest<AdminScheme>("/api/admin/schemes", {
        method: "POST",
        token: session.access_token,
        body: { slug: slug.trim(), name: name.trim(), issuing_body: authority.trim() },
      });
      setPartialScheme(scheme);
      const version = await apiRequest<SchemeVersion>(`/api/admin/schemes/${scheme.id}/versions`, {
        method: "POST", token: session.access_token, body: { academic_year: academicYear.trim() },
      });
      const source = await apiRequest<SchemeSource>(`/api/admin/scheme-versions/${version.id}/sources`, {
        method: "POST", token: session.access_token,
        body: { official_url: sourceUrl.trim(), issuing_authority: authority.trim(), notes: blankToNull(sourceNotes) },
      });
      await apiRequest<VersionContent>(`/api/admin/scheme-versions/${version.id}/content`, {
        method: "PATCH", token: session.access_token,
        body: { benefit_summary: blankToNull(benefit), deadline_text: blankToNull(deadline), application_start_date: startDate || null, application_end_date: endDate || null },
      });

      const documentNames = [...new Set(documents.split("\n").map((item) => item.trim()).filter(Boolean))];
      for (const documentName of documentNames) {
        await apiRequest(`/api/admin/scheme-versions/${version.id}/documents`, {
          method: "POST", token: session.access_token,
          body: { document_name: documentName, document_kind: "other", is_mandatory: true, source_id: source.id },
        });
      }
      for (const criterion of criteria.filter((item) => item.attribute.trim())) {
        await apiRequest(`/api/admin/scheme-versions/${version.id}/eligibility-rules`, {
          method: "POST", token: session.access_token,
          body: { attribute: criterion.attribute.trim(), operator: criterion.operator, value: criterionValue(criterion), source_id: source.id },
        });
      }
      router.push(`/admin/schemes/${scheme.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && !scheme) {
        setErrors((current) => ({ ...current, slug: "This slug is already in use." }));
      } else {
        setSubmitError(error instanceof ApiError ? error.message : "The scholarship could not be saved completely.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-4xl" aria-label="Add complete scholarship">
      <section className="grid gap-4 pb-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold text-slate-950">Required information</h2>
          <p className="mt-1 text-sm text-slate-600">Start with these four details. Everything else can be opened only when needed.</p>
        </div>
        <Input label="Scholarship name" value={name} onChange={(event) => changeName(event.target.value)} error={errors.name} required />
        <Input label="Issuing authority" value={authority} onChange={(event) => setAuthority(event.target.value)} error={errors.authority} required />
        <Input label="Academic year" placeholder="2026-27" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} error={errors.year} required />
        <Input label="Official source URL" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} error={errors.url} required />
      </section>

      <div className="divide-y divide-slate-200 border-y border-slate-200">
        <details className="group py-1" open={errors.dates ? true : undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-900">
            <span>Dates and benefits <span className="ml-2 text-xs font-normal text-slate-500">Optional</span></span>
            <span className="text-xl text-slate-400 group-open:rotate-45">+</span>
          </summary>
          <div className="grid gap-4 pb-6 md:grid-cols-2">
            <Input label="Application opening date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input label="Application closing date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} error={errors.dates} />
            <label className="text-sm font-medium text-slate-700">Benefit summary<textarea rows={3} value={benefit} onChange={(event) => setBenefit(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950" /></label>
            <label className="text-sm font-medium text-slate-700">Official deadline wording<textarea rows={3} value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950" /></label>
          </div>
        </details>

        <details className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-900">
            <span>Required documents {documents.trim() ? <span className="ml-2 text-xs font-normal text-teal-700">Added</span> : <span className="ml-2 text-xs font-normal text-slate-500">Optional</span>}</span>
            <span className="text-xl text-slate-400 group-open:rotate-45">+</span>
          </summary>
          <label className="block pb-6 text-sm font-medium text-slate-700">Enter one document per line<textarea rows={5} value={documents} onChange={(event) => setDocuments(event.target.value)} placeholder={"Income certificate\nPrevious marks memo\nBank passbook"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950" /></label>
        </details>

        <details className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-900">
            <span>Eligibility criteria <span className="ml-2 text-xs font-normal text-slate-500">{criteria.length === 0 ? "Optional" : `${criteria.length} added`}</span></span>
            <span className="text-xl text-slate-400 group-open:rotate-45">+</span>
          </summary>
          <div className="space-y-4 pb-6">
            <p className="text-sm text-slate-600">Add only conditions stated by the official source.</p>
            {criteria.map((criterion, index) => (
              <div key={index} className="grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-[1fr_160px_1fr_auto]">
                <Input label="Profile field" placeholder="annual_income" value={criterion.attribute} onChange={(event) => updateCriterion(index, { attribute: event.target.value })} />
                <label className="text-sm font-medium text-slate-700">Operator<select value={criterion.operator} onChange={(event) => updateCriterion(index, { operator: event.target.value as Operator })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{OPERATORS.map((operator) => <option key={operator}>{operator}</option>)}</select></label>
                {criterion.operator === "is_set" ? <div /> : <Input label="Value" placeholder={criterion.operator === "between" ? "10000, 200000" : "value"} value={criterion.value} onChange={(event) => updateCriterion(index, { value: event.target.value })} />}
                <button type="button" onClick={() => setCriteria((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="self-end px-2 py-2 text-sm font-medium text-red-700">Remove</button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => setCriteria((items) => [...items, { attribute: "", operator: "eq", value: "" }])}>Add criterion</Button>
          </div>
        </details>

        <details className="group py-1" open={errors.slug ? true : undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-900">
            <span>Advanced settings <span className="ml-2 text-xs font-normal text-slate-500">Usually no changes needed</span></span>
            <span className="text-xl text-slate-400 group-open:rotate-45">+</span>
          </summary>
          <div className="grid gap-4 pb-6 md:grid-cols-2">
            <Input label="URL slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value); }} error={errors.slug} required />
            <Input label="Source notes" value={sourceNotes} onChange={(event) => setSourceNotes(event.target.value)} />
          </div>
        </details>
      </div>

      <div className="space-y-3 pt-6">
        {submitError ? <ErrorMessage message={submitError} /> : null}
        {partialScheme && submitError ? <p className="text-sm text-amber-800">A partial draft was created. <Link href={`/admin/schemes/${partialScheme.id}`} className="font-semibold underline">Open it to finish manually</Link>.</p> : null}
        <Button type="submit" disabled={busy || !session}>{busy ? "Saving scholarship..." : "Save scholarship"}</Button>
        <p className="text-xs text-slate-500">Saving does not publish it. Official-source verification and approval are required next.</p>
      </div>
    </form>
  );
}
