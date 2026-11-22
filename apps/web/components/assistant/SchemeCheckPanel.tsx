"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { apiRequest } from "@/lib/api/client";
import type {
  AiExplanationRequest,
  AiExplanationResponse,
  AiLanguage,
  AttributeValue,
  EligibilityEvaluateRequest,
  EligibilityResponse,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/session";
import { OUTCOME_LABELS } from "@/lib/eligibility/labels";

export interface SchemeCheckPanelProps {
  schemeVersionId: string;
  profile: Record<string, AttributeValue>;
  language: AiLanguage;
}

/**
 * Checks one scheme with the deterministic rules, then, only once a result exists,
 * asks the AI to explain it. The explanation is text; the outcome comes from the rules.
 */
export default function SchemeCheckPanel({ schemeVersionId, profile, language }: SchemeCheckPanelProps) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [evaluation, setEvaluation] = useState<EligibilityResponse | null>(null);
  const [explanation, setExplanation] = useState<AiExplanationResponse | null>(null);
  const [busy, setBusy] = useState<"check" | "explain" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    if (!token) return;
    setBusy("check");
    setError(null);
    setExplanation(null);
    try {
      const body: EligibilityEvaluateRequest = { scheme_version_id: schemeVersionId, profile };
      const result = await apiRequest<EligibilityResponse>("/api/eligibility/evaluate", {
        method: "POST",
        token,
        body,
      });
      setEvaluation(result);
    } catch {
      setEvaluation(null);
      setError("Could not check this scholarship right now. Please try again later.");
    } finally {
      setBusy(null);
    }
  }

  async function runExplain() {
    if (!token || !evaluation) return;
    setBusy("explain");
    setError(null);
    try {
      const body: AiExplanationRequest = {
        scheme_version_id: schemeVersionId,
        profile,
        language,
      };
      const result = await apiRequest<AiExplanationResponse>("/api/ai/explanations", {
        method: "POST",
        token,
        body,
      });
      setExplanation(result);
    } catch {
      setExplanation(null);
      setError("Could not get the explanation right now. The eligibility result above still applies.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Check this scholarship</h2>
      <p className="text-sm text-slate-700">
        The eligibility result comes from fixed rules. An AI explanation is available after the
        check.
      </p>

      <Button type="button" variant="primary" disabled={busy !== null} onClick={runCheck}>
        Check eligibility
      </Button>

      {busy === "check" ? <Spinner label="Checking eligibility" /> : null}
      {error ? <ErrorMessage message={error} /> : null}

      {evaluation ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-700">Eligibility result</p>
          <p className="text-lg font-semibold text-slate-900" aria-live="polite">
            {OUTCOME_LABELS[evaluation.overall_outcome]}
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={runExplain}
          >
            Get AI explanation
          </Button>
          {busy === "explain" ? <Spinner label="Writing explanation" /> : null}
        </div>
      ) : null}

      {explanation ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
            AI explanation (not a decision)
          </p>
          <p className="whitespace-pre-line text-sm text-slate-900">{explanation.explanation}</p>
          {explanation.used_fallback ? (
            <p className="text-xs text-slate-600">
              Standard wording was used because the AI service was unavailable.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
