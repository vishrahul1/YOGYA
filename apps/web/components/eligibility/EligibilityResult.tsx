"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { ApiError, apiRequest } from "@/lib/api/client";
import type {
  EligibilityEvaluateRequest,
  EligibilityResponse,
  EligibilityRuleResult,
  StudentProfileResponse,
} from "@/lib/api/types";
import { isStoredProfile } from "@/lib/api/types";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import { useAuth } from "@/lib/auth/session";
import { OUTCOME_LABELS } from "@/lib/eligibility/labels";

interface RuleGroupProps {
  title: string;
  rules: EligibilityRuleResult[];
  emptyText: string;
}

function RuleGroup({ title, rules, emptyText }: RuleGroupProps) {
  const headingId = `rule-group-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="font-semibold text-slate-900">
        {title} ({rules.length})
      </h3>
      {rules.length === 0 ? (
        <p className="text-sm text-slate-600">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule, index) => (
            <li
              key={`${rule.rule_ref}-${index}`}
              className="rounded-lg border border-slate-200 p-3 text-sm"
            >
              <p className="font-medium text-slate-900">{rule.rule_ref}</p>
              <p className="text-slate-700">
                {rule.reason_code ?? "No explanation was recorded for this rule."}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface EligibilityResultProps {
  schemeVersionId: string;
}

/**
 * Shows the deterministic eligibility outcome from the backend.
 * The frontend only maps the returned outcome to a label; it never computes one.
 */
export default function EligibilityResult({ schemeVersionId }: EligibilityResultProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const profileState = useAuthedRequest<StudentProfileResponse>(
    "/api/student/profile",
    "Could not load your profile right now. Please try again later.",
  );
  const profile = profileState.data;

  const [result, setResult] = useState<EligibilityResponse | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || profile === null || !isStoredProfile(profile)) return;
    let active = true;
    setEvalLoading(true);
    setEvalError(null);
    const body: EligibilityEvaluateRequest = {
      scheme_version_id: schemeVersionId,
      profile: profile.attributes,
    };
    apiRequest<EligibilityResponse>("/api/eligibility/evaluate", {
      method: "POST",
      token,
      body,
    })
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setResult(null);
        setEvalError(
          err instanceof ApiError && err.status === 404
            ? "This scholarship is not available for an eligibility check."
            : "Could not check eligibility right now. Please try again later.",
        );
      })
      .finally(() => {
        if (active) setEvalLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, profile, schemeVersionId]);

  if (profileState.loading || evalLoading) {
    return <Spinner label="Checking eligibility" />;
  }

  if (profileState.error) {
    return <ErrorMessage message={profileState.error} />;
  }

  if (profile !== null && !isStoredProfile(profile)) {
    return (
      <Card>
        <p className="text-slate-900">
          You have not added your details yet, so there is nothing to check.
        </p>
        <Link href="/assistant" className="mt-3 inline-block text-accent-blue underline">
          Describe your circumstances in the assistant
        </Link>
      </Card>
    );
  }

  if (evalError) {
    return <ErrorMessage message={evalError} />;
  }

  if (!result) {
    return <Spinner label="Checking eligibility" />;
  }

  const passed = result.rule_results.filter((r) => r.outcome === "PASS");
  const failed = result.rule_results.filter((r) => r.outcome === "FAIL");
  const unknown = result.rule_results.filter((r) => r.outcome === "UNKNOWN");

  return (
    <section className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Overall result</h2>
        <p className="mt-2 text-xl font-bold text-slate-900" aria-live="polite">
          {OUTCOME_LABELS[result.overall_outcome]}
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Evaluated at {new Date(result.evaluated_at).toLocaleString("en-IN")}
        </p>
      </Card>

      <Card className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-900">Rule results</h2>
        <RuleGroup title="Passed" rules={passed} emptyText="No rules were passed." />
        <RuleGroup title="Failed" rules={failed} emptyText="No rules failed." />
        <RuleGroup title="Unknown" rules={unknown} emptyText="No rules are unknown." />
      </Card>

      <aside
        aria-label="Important information"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <p>
          This is an assessment based on the information you provided, not a guarantee of
          eligibility or of any benefit. Confirm your eligibility on the official government portal
          before you apply.
        </p>
      </aside>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-6">
        <Link href="/scholarships" className="text-accent-blue underline">
          Back to scholarships
        </Link>
        <Link
          href={`/assistant?scheme_version_id=${encodeURIComponent(schemeVersionId)}`}
          className="text-accent-blue underline"
        >
          Ask the assistant to explain this result
        </Link>
      </div>
    </section>
  );
}
