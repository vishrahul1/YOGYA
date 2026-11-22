"use client";

import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import type { DocumentTaskListResponse } from "@/lib/api/types";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import { formatDate } from "@/lib/scholarships/format";

export default function PendingDocumentTasksSection() {
  const state = useAuthedRequest<DocumentTaskListResponse>(
    "/api/student/document-tasks",
    "Could not load your document tasks right now. Please try again later.",
  );
  const pending = (state.data?.items ?? []).filter((task) => !task.is_done);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Pending document tasks</h2>
        <p className="text-xs text-slate-600">Self-reported checklist items.</p>
      </div>
      {state.loading ? <Spinner label="Loading document tasks" /> : null}
      {state.error ? <ErrorMessage message={state.error} /> : null}
      {!state.loading && !state.error && state.data !== null ? (
        pending.length === 0 ? (
          <p className="text-sm text-slate-700">No pending document tasks.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {pending.map((task) => (
              <li key={task.id} className="space-y-1 py-3 text-sm">
                <p className="font-medium text-slate-900">{task.title}</p>
                {task.document_kind ? (
                  <p className="text-slate-600">{task.document_kind}</p>
                ) : null}
                <p className="text-slate-600">
                  Due {task.due_on ? (formatDate(task.due_on) ?? task.due_on) : "date not set"}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Card>
  );
}
