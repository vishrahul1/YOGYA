"use client";

import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import type { ReminderDeliveryState, ReminderListResponse } from "@/lib/api/types";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import { formatDate } from "@/lib/scholarships/format";

const DELIVERY_LABELS: Record<ReminderDeliveryState, string> = {
  pending: "Scheduled",
  sent: "Sent",
  failed: "Could not be sent",
  cancelled: "Cancelled",
};

export default function UpcomingRemindersSection() {
  const state = useAuthedRequest<ReminderListResponse>(
    "/api/student/reminders",
    "Could not load your reminders right now. Please try again later.",
  );

  // Only reminders at or after now are shown. The backend returns them ordered by remind_at.
  const now = Date.now();
  const upcoming = (state.data?.items ?? []).filter(
    (item) => new Date(item.remind_at).getTime() >= now,
  );

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Upcoming reminders</h2>
      {state.loading ? <Spinner label="Loading reminders" /> : null}
      {state.error ? <ErrorMessage message={state.error} /> : null}
      {!state.loading && !state.error && state.data !== null ? (
        upcoming.length === 0 ? (
          <p className="text-sm text-slate-700">No upcoming reminders.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {upcoming.map((item) => (
              <li key={item.id} className="space-y-1 py-3 text-sm">
                <p className="text-slate-900">{item.message}</p>
                <p className="text-slate-600">
                  {formatDate(item.remind_at) ?? "Date not recorded"} ·{" "}
                  {DELIVERY_LABELS[item.delivery_state]}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Card>
  );
}
