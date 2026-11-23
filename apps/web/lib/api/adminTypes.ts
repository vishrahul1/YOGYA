/**
 * Admin response and request shapes from the YOGYA FastAPI backend.
 * Sources: services/api/app/routers/admin_schemes.py, routers/admin_verification.py,
 * schemas/admin.py, schemas/admin_verification.py.
 * Kept separate from lib/api/types.ts. Do not add fields the backend does not return.
 */

/** Scheme status as the backend returns it. Create always starts at 'draft'. Shown as-is. */
export type AdminSchemeStatus = string;

/** One item of GET /api/admin/schemes and the body of GET /api/admin/schemes/{id}. */
export interface AdminScheme {
  id: string;
  slug: string;
  name: string;
  status: AdminSchemeStatus;
  issuing_body: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminSchemeListResponse {
  items: AdminScheme[];
  limit: number;
  offset: number;
}

/** POST /api/admin/schemes request. slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$. */
export interface SchemeCreateRequest {
  slug: string;
  name: string;
  issuing_body?: string | null;
}

/** POST /api/admin/schemes/import-url request. Makes no outbound request. */
export interface ImportUrlRequest {
  official_url: string;
  name?: string | null;
  issuing_body?: string | null;
}

/** POST /api/admin/schemes/import-url response (201). */
export interface ImportUrlResponse {
  scheme_id: string;
  scheme_source_id: string;
  slug: string;
  status: AdminSchemeStatus;
}

/** PATCH /api/admin/schemes/{id} request. Status cannot be changed here. */
export interface SchemeUpdateRequest {
  slug?: string;
  name?: string;
  issuing_body?: string | null;
}

export type SchemeVersionStatus = "draft" | "in_review" | "verified" | "published" | "retired";

/** A scheme version as returned by the verification routes. */
export interface SchemeVersion {
  id: string;
  scheme_id: string;
  version_number: number;
  academic_year: string;
  status: SchemeVersionStatus;
  verified_at: string | null;
  published_at: string | null;
  source_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SchemeVersionListResponse {
  items: SchemeVersion[];
}

/** POST /api/admin/schemes/{scheme_id}/versions request. academic_year is YYYY-YY. */
export interface VersionCreateRequest {
  academic_year: string;
}

/** A scheme source as returned by POST /api/admin/scheme-versions/{id}/sources. */
export interface SchemeSource {
  id: string;
  scheme_id: string;
  official_url: string;
  issuing_authority: string;
  notes: string | null;
  retrieved_at: string | null;
  verified_at: string | null;
}

export interface SchemeSourceListResponse {
  items: SchemeSource[];
}

export interface AdminRequiredDocument {
  id: string;
  document_name: string;
  document_kind: string;
  is_mandatory: boolean;
  source_id: string | null;
}

export interface AdminEligibilityRule {
  id: string;
  rule_json: {
    root?: { attribute?: string; operator?: string; value?: unknown };
  };
  source_id: string;
  sort_order: number;
}

export interface VersionContent {
  benefit_summary: string | null;
  deadline_text: string | null;
  application_start_date: string | null;
  application_end_date: string | null;
  required_documents: AdminRequiredDocument[];
  eligibility_rules: AdminEligibilityRule[];
}

/** POST /api/admin/scheme-versions/{id}/sources request. */
export interface SourceCreateRequest {
  official_url: string;
  issuing_authority: string;
  notes?: string | null;
}

/** POST /api/admin/scheme-versions/{id}/reject request. */
export interface ReasonRequest {
  reason: string;
}

/** One item of GET /api/admin/scheme-versions/{id}/history. */
export interface VersionHistoryItem {
  id: string;
  action: string;
  actor_user_id: string | null;
  note: string | null;
  recorded_at: string | null;
}

export interface VersionHistoryResponse {
  items: VersionHistoryItem[];
}
