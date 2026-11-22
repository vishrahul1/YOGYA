"use client";

import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { REMINDER_STATE_LABELS } from "@/components/tracking/labels";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import type { ReminderListResponse } from "@/lib/api/types";
import { formatDate } from "@/lib/scholarships/format";

const LOAD_FAILED = "Could not load your reminders. Please try again later.";

/**
 * Lists reminders that are still ahead and not cancelled.
 * Each row shows the backend's delivery_state. The UI never claims a reminder was
 * sent by email or SMS; the channel is shown exactly as the backend returns it.
 */
export default function RemindersSection() {
  const { data, error, loading } = useAuthedRequest<ReminderListResponse>(
    "/api/student/reminders",
    LOAD_FAILED,
  );

  if (loading && data === null && !error) {
    return <Spinner label="Loading reminders" />;
  }
  if (error) {
    return <ErrorMessage message={error} />;
  }

  const now = Date.now();
  const upcoming = (data?.items ?? []).filter(
    (r) => r.delivery_state !== "cancelled" && new Date(r.remind_at).getTime() >= now,
  );

  if (upcoming.length === 0) {
    return <EmptyState title="No upcoming reminders" />;
  }

  return (
    <ul className="space-y-3">
      {upcoming.map((reminder) => {
        const when = formatDate(reminder.remind_at);
        return (
          <li key={reminder.id}>
            <Card className="space-y-1 p-4">
              <p className="font-medium text-slate-900">{reminder.message}</p>
              <p className="text-sm text-slate-600">{when ? `Remind on ${when}` : "Date not stated"}</p>
              <p className="text-sm text-slate-700">
                Status: {REMINDER_STATE_LABELS[reminder.delivery_state]}
              </p>
              <p className="text-xs text-slate-500">Channel: {reminder.channel}</p>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
