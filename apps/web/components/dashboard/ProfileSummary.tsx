"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import type { StudentProfileResponse } from "@/lib/api/types";
import { isStoredProfile } from "@/lib/api/types";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import { formatDate } from "@/lib/scholarships/format";

export default function ProfileSummary() {
  const state = useAuthedRequest<StudentProfileResponse>(
    "/api/student/profile",
    "Could not load your profile right now. Please try again later.",
  );

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">Profile summary</h2>
      {state.loading ? <Spinner label="Loading profile" /> : null}
      {state.error ? <ErrorMessage message={state.error} /> : null}
      {!state.loading && !state.error && state.data !== null ? (
        isStoredProfile(state.data) ? (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-700">Details recorded</dt>
              <dd className="text-slate-900">{Object.keys(state.data.attributes).length}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Preferred language</dt>
              <dd className="text-slate-900">
                {state.data.preferred_language === "te"
                  ? "Telugu"
                  : state.data.preferred_language === "en"
                    ? "English"
                    : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Last updated</dt>
              <dd className="text-slate-900">{formatDate(state.data.updated_at) ?? "Not recorded"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-700">
            You have not added your details yet.{" "}
            <Link href="/assistant" className="text-accent-blue underline">
              Describe your situation in the assistant
            </Link>
            .
          </p>
        )
      ) : null}
    </Card>
  );
}
