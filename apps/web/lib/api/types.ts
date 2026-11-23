/**
 * Response shapes from the YOGYA FastAPI backend.
 * Source: services/api/app/routers/access.py (/api/me) and
 * services/api/app/routers/schemes.py (/api/schemes, /api/schemes/{id}).
 * Keep in sync with the backend; do not add fields the backend does not return.
 */

/** GET /api/me. `role` is the application role from role_assignments, or null. */
export interface ApiMe {
  auth_user_id: string;
  email: string | null;
  role: string | null;
}

/** One item in GET /api/schemes. `scheme_version_id` is the id used for the detail route. */
export interface SchemeListItem {
  scheme_id: string;
  scheme_version_id: string;
  slug: string;
  name: string;
  academic_year: string;
  benefit_summary: string | null;
  deadline_text: string | null;
  application_start_date: string | null;
  application_end_date: string | null;
  official_url: string | null;
  issuing_authority: string | null;
  verified_at: string | null;
  published_at: string | null;
}

/** GET /api/schemes. The backend returns no total count, so pagination is next/previous only. */
export interface SchemeListResponse {
  items: SchemeListItem[];
  limit: number;
  offset: number;
}

export interface SchemeRequiredDocument {
  document_name: string;
  document_kind: string;
  is_mandatory: boolean;
}

/**
 * GET /api/schemes/{scheme_version_id}.
 * The backend also returns `rules`; it is intentionally not typed here because
 * the catalogue detail page must not show eligibility results.
 */
export interface SchemeDetail extends SchemeListItem {
  required_documents: SchemeRequiredDocument[];
}

/* ------------------------------------------------------------------ */
/* Eligibility: services/api/app/schemas/eligibility.py                */
/* ------------------------------------------------------------------ */

/** Scheme-level outcome. Labels are chosen in the UI, never computed here. */
export type OverallOutcome =
  | "LIKELY_ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "NEED_MORE_INFORMATION"
  | "UNVERIFIED";

/** Per-rule outcome (schemas/common.py OutcomeLiteral). */
export type RuleOutcome = "PASS" | "FAIL" | "UNKNOWN";

/** One item of EligibilityResponse.rule_results. `reason_code` carries the explanation text. */
export interface EligibilityRuleResult {
  rule_ref: string;
  outcome: RuleOutcome;
  reason_code: string | null;
}

/** POST /api/eligibility/evaluate request. `profile` is the attributes dict. */
export interface EligibilityEvaluateRequest {
  scheme_version_id: string;
  profile: Record<string, AttributeValue>;
}

/** POST /api/eligibility/evaluate response. */
export interface EligibilityResponse {
  scheme_version_id: string;
  overall_outcome: OverallOutcome;
  rule_results: EligibilityRuleResult[];
  evaluated_at: string;
  rule_format_version: number;
}

/* ------------------------------------------------------------------ */
/* Student profile: access.py GET /api/student/profile                  */
/* ------------------------------------------------------------------ */

/** Mirrors schemas/profile.py AttributeValue. */
export type AttributeValue = string | number | boolean | null | string[];

/** Stored profile row. The endpoint returns `{}` when no profile exists. */
export interface StudentProfile {
  id: string;
  user_id: string;
  attributes: Record<string, AttributeValue>;
  preferred_language: "en" | "te" | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/student/profile. The backend returns `{}` when no profile exists. */
export type StudentProfileResponse = StudentProfile | Record<string, never>;

/** Type guard: true when the response is a stored profile rather than `{}`. */
export function isStoredProfile(value: StudentProfileResponse): value is StudentProfile {
  return typeof (value as { id?: unknown }).id === "string";
}

/* ------------------------------------------------------------------ */
/* AI routes: services/api/app/schemas/ai.py                           */
/* ------------------------------------------------------------------ */

export type AiLanguage = "en" | "te";

/** POST /api/ai/profile/extract request. */
export interface AiProfileExtractRequest {
  text: string;
  language: AiLanguage;
}

export interface AiFollowupQuestion {
  key: string;
  en: string;
  te: string;
}

/** POST /api/ai/profile/extract response. */
export interface AiProfileExtractResponse {
  profile: Record<string, AttributeValue>;
  missing: string[];
  followup_questions: AiFollowupQuestion[];
  used_fallback: boolean;
}

/** POST /api/ai/follow-ups request. `missing` must be known profile keys. */
export interface AiFollowUpsRequest {
  missing: string[];
  language: AiLanguage;
}

/** POST /api/ai/follow-ups response. Questions carry no key; order matches `missing`. */
export interface AiFollowUpsResponse {
  questions: string[];
  used_fallback: boolean;
}

export interface AiChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  message: string;
  language: AiLanguage;
  scheme_version_id?: string;
  profile: Record<string, AttributeValue>;
  history: AiChatHistoryMessage[];
}

export interface AiChatResponse extends AiProfileExtractResponse {
  reply: string;
  intent: "profile" | "question" | "both" | "unsupported";
}

/** POST /api/ai/explanations request. The backend computes the outcome itself. */
export interface AiExplanationRequest {
  scheme_version_id: string;
  profile: Record<string, AttributeValue>;
  language: AiLanguage;
}

export interface AiExplanationRuleResult {
  rule_label: string;
  result: string;
  explanation: string;
}

/** POST /api/ai/explanations response. */
export interface AiExplanationResponse {
  scheme_version_id: string;
  outcome: OverallOutcome;
  explanation: string;
  rule_results: AiExplanationRuleResult[];
  used_fallback: boolean;
}

/* ------------------------------------------------------------------ */
/* Student tracking: student_tracking.py                               */
/* ------------------------------------------------------------------ */

/** One item of GET /api/student/saved-schemes. Note: carries scheme_id, not scheme_version_id. */
export interface SavedScheme {
  id: string;
  scheme_id: string;
  scheme_name: string;
  saved_at: string | null;
}

export interface SavedSchemeListResponse {
  items: SavedScheme[];
}

export type ApplicationStatus =
  | "not_started"
  | "in_progress"
  | "submitted_on_portal"
  | "reported_result"
  | "withdrawn";

/** One item of GET /api/student/applications. Self-reported. */
export interface StudentApplication {
  id: string;
  scheme_version_id: string;
  status: ApplicationStatus;
  portal_reference: string | null;
  status_updated_at: string | null;
  self_reported: boolean;
}

export interface StudentApplicationListResponse {
  items: StudentApplication[];
  self_reported: boolean;
}

/** One item of GET /api/student/document-tasks. Self-reported. */
export interface DocumentTask {
  id: string;
  application_id: string;
  title: string;
  document_kind: string | null;
  is_done: boolean;
  due_on: string | null;
  updated_at: string | null;
  self_reported: boolean;
}

export interface DocumentTaskListResponse {
  items: DocumentTask[];
  self_reported: boolean;
}

export type ReminderDeliveryState = "pending" | "sent" | "failed" | "cancelled";

/** One item of GET /api/student/reminders. */
export interface Reminder {
  id: string;
  application_id: string | null;
  remind_at: string;
  message: string;
  delivery_state: ReminderDeliveryState;
  channel: string;
  created_at: string;
}

export interface ReminderListResponse {
  items: Reminder[];
}

/* ------------------------------------------------------------------ */
/* Student tracking write shapes: student_tracking.py                  */
/* ------------------------------------------------------------------ */

/** POST /api/student/saved-schemes request. The backend resolves the owner from the token. */
export interface SavedSchemeCreateRequest {
  scheme_version_id: string;
}

/** POST /api/student/saved-schemes response (201). Carries scheme_id, not scheme_version_id. */
export interface SavedSchemeCreated {
  id: string;
  scheme_id: string;
  saved_at: string | null;
}

/** PATCH /api/student/applications/{id} request. `status` must be one of ApplicationStatus. */
export interface ApplicationStatusUpdateRequest {
  status: ApplicationStatus;
}

/** PATCH /api/student/document-tasks/{id} request. Preparation status only. */
export interface DocumentTaskUpdateRequest {
  is_done: boolean;
}

