import type { SchemeVersionStatus } from "@/lib/api/adminTypes";

/** Same patterns as schemas/admin.py and schemas/admin_verification.py. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ACADEMIC_YEAR_PATTERN = /^[0-9]{4}-[0-9]{2}$/;
export const HTTPS_URL_PATTERN = /^https:\/\/[^/\s]+\S*$/;
export const SOURCE_URL_PATTERN = /^https:\/\//;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const VERSION_STATUS_LABELS: Record<SchemeVersionStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  verified: "Verified",
  published: "Published",
  retired: "Retired",
};

const SCHEME_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  retired: "Retired",
};

/** Scheme status labels. Unknown values are shown exactly as the backend returns them. */
export function schemeStatusLabel(status: string): string {
  return SCHEME_STATUS_LABELS[status] ?? status;
}

/** Reads a URL-safe string from user input, mapping blank to null for optional fields. */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
