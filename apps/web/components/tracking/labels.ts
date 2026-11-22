import type { ApplicationStatus, ReminderDeliveryState } from "@/lib/api/types";

/** Allowed values for PATCH /api/student/applications/{id} (schemas/applications.py). */
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "not_started",
  "in_progress",
  "submitted_on_portal",
  "reported_result",
  "withdrawn",
];

/** Labels say what the student reported. They never state that YOGYA confirmed anything. */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted_on_portal: "I submitted on the portal (self-reported)",
  reported_result: "I have a result (self-reported)",
  withdrawn: "Withdrawn",
};

export const REMINDER_STATE_LABELS: Record<ReminderDeliveryState, string> = {
  pending: "Scheduled",
  sent: "Sent",
  failed: "Could not be sent",
  cancelled: "Cancelled",
};

export const SELF_REPORTED_NOTE =
  "Self-reported. Not verified against any government system. Apply only through the official portal.";
