"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import { apiRequest } from "@/lib/api/client";
import type { SchemeSource, SchemeVersionStatus, VersionContent } from "@/lib/api/adminTypes";
import { useAuth } from "@/lib/auth/session";

const OPERATORS = ["eq", "neq", "lt", "lte", "gt", "gte", "in", "not_in", "between", "is_set"] as const;

export default function VersionContentEditor({ versionId, status, sources }: { versionId: string; status: SchemeVersionStatus; sources: SchemeSource[] }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const base = `/api/admin/scheme-versions/${encodeURIComponent(versionId)}`;
  const [content, setContent] = useState<VersionContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [benefit, setBenefit] = useState("");
  const [deadline, setDeadline] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [documentKind, setDocumentKind] = useState("other");
  const [mandatory, setMandatory] = useState(true);
  const [documentSource, setDocumentSource] = useState("");
  const [attribute, setAttribute] = useState("");
  const [operator, setOperator] = useState<(typeof OPERATORS)[number]>("eq");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleSource, setRuleSource] = useState("");

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<VersionContent>(`${base}/content`, { token });
      setContent(result);
      setBenefit(result.benefit_summary ?? "");
      setDeadline(result.deadline_text ?? "");
      setStartDate(result.application_start_date ?? "");
      setEndDate(result.application_end_date ?? "");
    } catch {
      setError("Could not load scholarship content. Ensure database migration 0009 is applied.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, versionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveDetails() {
    if (!token) return;
    setBusy("details"); setError(null);
    try {
      const result = await apiRequest<VersionContent>(`${base}/content`, { method: "PATCH", token, body: {
        benefit_summary: benefit.trim() || null,
        deadline_text: deadline.trim() || null,
        application_start_date: startDate || null,
        application_end_date: endDate || null,
      } });
      setContent(result);
    } catch { setError("Could not save version details. Check that the dates are valid."); }
    finally { setBusy(null); }
  }

  async function addDocument() {
    if (!token || !documentName.trim()) return;
    setBusy("document"); setError(null);
    try {
      await apiRequest(`${base}/documents`, { method: "POST", token, body: {
        document_name: documentName.trim(), document_kind: documentKind.trim() || "other",
        is_mandatory: mandatory, source_id: documentSource || null,
      } });
      setDocumentName(""); await load();
    } catch { setError("Could not add the required document. Names must be unique for this version."); }
    finally { setBusy(null); }
  }

  async function removeDocument(id: string) {
    if (!token) return;
    await apiRequest(`${base}/documents/${encodeURIComponent(id)}`, { method: "DELETE", token });
    await load();
  }

  function parsedValue(): unknown {
    if (operator === "is_set") return null;
    if (operator === "in" || operator === "not_in") return ruleValue.split(",").map((item) => item.trim()).filter(Boolean);
    if (operator === "between") return ruleValue.split(",").map((item) => Number(item.trim()));
    const number = Number(ruleValue);
    return ruleValue.trim() !== "" && Number.isFinite(number) ? number : ruleValue.trim();
  }

  async function addRule() {
    if (!token || !attribute.trim() || !ruleSource) return;
    setBusy("rule"); setError(null);
    try {
      await apiRequest(`${base}/eligibility-rules`, { method: "POST", token, body: {
        attribute: attribute.trim(), operator, value: parsedValue(), source_id: ruleSource,
      } });
      setAttribute(""); setRuleValue(""); await load();
    } catch { setError("Could not add the criterion. Check its attribute, value, and official source."); }
    finally { setBusy(null); }
  }

  async function removeRule(id: string) {
    if (!token) return;
    await apiRequest(`${base}/eligibility-rules/${encodeURIComponent(id)}`, { method: "DELETE", token });
    await load();
  }

  if (loading) return <Spinner label="Loading scholarship content" />;
  if (!content) return error ? <ErrorMessage message={error} /> : null;
  const editable = status === "draft";

  return (
    <section className="space-y-6">
      {error ? <ErrorMessage message={error} /> : null}
      <details className="group border-b border-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-950">
          <span>Dates and benefit details</span>
          <span className="text-xl font-normal text-slate-400 group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-4 pb-5">
      <p className="text-sm text-slate-600">Dates and details must match an official source. Content locks after submission.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Application start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!editable} />
        <Input label="Application end date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!editable} />
      </div>
      <label className="block text-sm font-medium text-slate-700">Benefit summary<textarea rows={3} value={benefit} onChange={(e) => setBenefit(e.target.value)} disabled={!editable} className="mt-1 w-full rounded-lg border border-slate-300 p-3" /></label>
      <label className="block text-sm font-medium text-slate-700">Official deadline wording<textarea rows={2} value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!editable} className="mt-1 w-full rounded-lg border border-slate-300 p-3" /></label>
      {editable ? <Button onClick={saveDetails} disabled={busy !== null}>{busy === "details" ? "Saving..." : "Save dates and details"}</Button> : null}
        </div>
      </details>

      <details className="group border-b border-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-950"><span>Required documents <span className="ml-2 text-xs font-normal text-slate-500">{content.required_documents.length}</span></span><span className="text-xl font-normal text-slate-400 group-open:rotate-45">+</span></summary>
        <div className="space-y-3 pb-2">
        <ul className="space-y-2">{content.required_documents.map((doc) => <li key={doc.id} className="flex items-center justify-between rounded-lg bg-white p-3 text-sm"><span>{doc.document_name} · {doc.document_kind}{doc.is_mandatory ? " · Mandatory" : " · Optional"}</span>{editable ? <button onClick={() => void removeDocument(doc.id)} className="text-red-600">Remove</button> : null}</li>)}</ul>
        {editable ? <div className="grid gap-3 md:grid-cols-2"><Input label="Document name" value={documentName} onChange={(e) => setDocumentName(e.target.value)} /><Input label="Document kind" value={documentKind} onChange={(e) => setDocumentKind(e.target.value)} /><label className="text-sm"><input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Mandatory</label><select value={documentSource} onChange={(e) => setDocumentSource(e.target.value)} className="rounded-lg border border-slate-300 p-2"><option value="">No source selected</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.issuing_authority}</option>)}</select><Button onClick={addDocument} disabled={busy !== null || !documentName.trim()}>Add document</Button></div> : null}
        </div>
      </details>

      <details className="group border-b border-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-slate-950"><span>Eligibility criteria <span className="ml-2 text-xs font-normal text-slate-500">{content.eligibility_rules.length}</span></span><span className="text-xl font-normal text-slate-400 group-open:rotate-45">+</span></summary>
        <div className="space-y-3 pb-2">
        <p className="text-xs text-slate-500">All criteria are combined deterministically. Comma-separate lists and between values.</p>
        <ul className="space-y-2">{content.eligibility_rules.map((rule) => <li key={rule.id} className="flex items-center justify-between rounded-lg bg-white p-3 text-sm"><span>{rule.rule_json.root?.attribute} {rule.rule_json.root?.operator} {JSON.stringify(rule.rule_json.root?.value ?? "")}</span>{editable ? <button onClick={() => void removeRule(rule.id)} className="text-red-600">Remove</button> : null}</li>)}</ul>
        {editable ? <div className="grid gap-3 md:grid-cols-2"><Input label="Profile attribute" placeholder="annual_income" value={attribute} onChange={(e) => setAttribute(e.target.value)} /><select value={operator} onChange={(e) => setOperator(e.target.value as (typeof OPERATORS)[number])} className="rounded-lg border border-slate-300 p-2">{OPERATORS.map((item) => <option key={item}>{item}</option>)}</select>{operator !== "is_set" ? <Input label="Value" placeholder={operator === "between" ? "10000, 200000" : operator === "in" ? "SC, ST, OBC" : "value"} value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} /> : <div /> }<select value={ruleSource} onChange={(e) => setRuleSource(e.target.value)} className="rounded-lg border border-slate-300 p-2"><option value="">Select official source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.issuing_authority}</option>)}</select><Button onClick={addRule} disabled={busy !== null || !attribute.trim() || !ruleSource}>Add criterion</Button></div> : null}
        </div>
      </details>
    </section>
  );
}
