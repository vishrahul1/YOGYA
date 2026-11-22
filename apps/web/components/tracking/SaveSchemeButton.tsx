"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { ApiError, apiRequest } from "@/lib/api/client";
import type { SavedSchemeCreated, SavedSchemeCreateRequest } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/session";

export interface SaveSchemeButtonProps {
  schemeVersionId: string;
}

interface Message {
  kind: "success" | "info" | "error";
  text: string;
}

/**
 * Saves a published scheme version for the signed-in student.
 * Signed-out users are sent to /login. The backend enforces ownership and publication.
 */
export default function SaveSchemeButton({ schemeVersionId }: SaveSchemeButtonProps) {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleClick() {
    // Wait for the session to resolve so a signed-in user is not sent to /login by mistake.
    if (loading) return;
    if (!session) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setMessage(null);
    const body: SavedSchemeCreateRequest = { scheme_version_id: schemeVersionId };
    try {
      await apiRequest<SavedSchemeCreated>("/api/student/saved-schemes", {
        method: "POST",
        token: session.access_token,
        body,
      });
      setMessage({
        kind: "success",
        text: "Saved. You can find it on your saved scholarships page.",
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMessage({ kind: "info", text: "This scholarship is already saved." });
      } else {
        setMessage({
          kind: "error",
          text: "Could not save this scholarship. Please try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  const messageClass =
    message?.kind === "error"
      ? "text-red-800"
      : message?.kind === "success"
        ? "text-emerald-800"
        : "text-slate-700";

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="secondary" onClick={handleClick} disabled={busy || loading}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </div>
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${messageClass}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
