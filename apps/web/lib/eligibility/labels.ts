import type { OverallOutcome } from "@/lib/api/types";

/**
 * Display labels for the backend's overall outcome. The frontend maps; it never decides.
 * Wording is fixed by product spec and must not say "guaranteed".
 */
export const OUTCOME_LABELS: Record<OverallOutcome, string> = {
  LIKELY_ELIGIBLE: "Likely eligible",
  NEED_MORE_INFORMATION: "More information needed",
  NOT_ELIGIBLE: "Not eligible based on current information",
  UNVERIFIED: "Not yet verified",
};
