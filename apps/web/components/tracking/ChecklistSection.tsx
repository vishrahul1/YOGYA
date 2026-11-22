"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { SELF_REPORTED_NOTE } from "@/components/tracking/labels";
import { apiRequest } from "@/lib/api/client";
import { useAuthedRequest } from "@/lib/api/useAuthedRequest";
import type {
  DocumentTask,
  DocumentTaskListResponse,
  DocumentTaskUpdateRequest,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/session";
import { formatDate } from "@/lib/scholarships/format";

const LOAD_FAILED = "Could not load your document checklist. Please try again later.";

export default function ChecklistSection() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { data, error, loading, reload } = useAuthedRequest<DocumentTaskListResponse>(
    "/api/student/document-tasks",
    LOAD_FAILED,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleToggle(task: DocumentTask) {
    if (!token) return;
    setBusyId(task.id);
    setActionError(null);
    const body: DocumentTaskUpdateRequest = { is_done: !task.is_done };
    try {
      await apiRequest<DocumentTask>(
        `/api/student/document-tasks/${encodeURIComponent(task.id)}`,
        { method: "PATCH", token, body },
      );
      reload();
    } catch {
      setActionError("Could not update this item. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && data === null && !error) {
    return <Spinner label="Loading document checklist" />;
  }
  if (error) {
    return <ErrorMessage message={error} />;
  }

  return (
    <div className="space-y-4">
      <p
        role="note"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        {SELF_REPORTED_NOTE}
      </p>
      {actionError ? <ErrorMessage message={actionError} /> : null}

      {data === null || data.items.length === 0 ? (
        <EmptyState
          title="No document tasks yet"
          description="Document preparation tasks will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((task) => {
            const due = formatDate(task.due_on);
            const checkboxId = `task-${task.id}`;
            return (
              <li key={task.id}>
                <Card className="flex items-start gap-3 p-4">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={task.is_done}
                    disabled={busyId === task.id}
                    onChange={() => handleToggle(task)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-accent-teal focus-visible:ring-2 focus-visible:ring-accent-blue"
                  />
                  <div className="space-y-1">
                    <label htmlFor={checkboxId} className="font-medium text-slate-900">
                      {task.title}
                    </label>
                    {task.document_kind ? (
                      <p className="text-sm text-slate-600">Document: {task.document_kind}</p>
                    ) : null}
                    {due ? <p className="text-sm text-slate-600">Due {due}</p> : null}
                    <p className="text-sm text-slate-700">
                      {task.is_done ? "Marked as prepared (self-reported)" : "Not yet marked as prepared"}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
