"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import FollowUpForm from "@/components/assistant/FollowUpForm";
import ProfileConfirmForm, { humanizeKey } from "@/components/assistant/ProfileConfirmForm";
import SchemeCheckPanel from "@/components/assistant/SchemeCheckPanel";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { apiRequest } from "@/lib/api/client";
import type {
  AiFollowUpsRequest,
  AiFollowUpsResponse,
  AiLanguage,
  AiProfileExtractRequest,
  AiProfileExtractResponse,
  AttributeValue,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/session";

/** Mirrors the backend limits: MAX_TEXT_CHARS and MAX_MISSING_KEYS in schemas/ai.py. */
const MAX_TEXT_CHARS = 2000;
const MAX_FOLLOWUP_KEYS = 10;

type Stage = "describe" | "confirm" | "followups" | "done";

interface ChatMessage {
  id: number;
  from: "student" | "assistant";
  text: string;
}

function isBlank(value: AttributeValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function formatValue(value: AttributeValue): string {
  if (value === null) return "Not given";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "Not given";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export interface AssistantChatProps {
  /** Set when the student arrives from a scheme's eligibility result. Validated by the page. */
  schemeVersionId: string | null;
}

export default function AssistantChat({ schemeVersionId }: AssistantChatProps) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const nextMessageId = useRef(0);
  const [stage, setStage] = useState<Stage>("describe");
  const [language, setLanguage] = useState<AiLanguage>("en");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<AiProfileExtractResponse | null>(null);
  const [followUpKeys, setFollowUpKeys] = useState<string[]>([]);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [profile, setProfile] = useState<Record<string, AttributeValue> | null>(null);

  const textareaId = useId();
  const languageId = useId();

  function pushMessage(from: ChatMessage["from"], text: string) {
    nextMessageId.current += 1;
    const id = nextMessageId.current;
    setMessages((prev) => [...prev, { id, from, text }]);
  }

  /** Keys to confirm: everything extracted plus everything the backend reported missing. */
  function confirmKeys(result: AiProfileExtractResponse): string[] {
    return Array.from(new Set([...Object.keys(result.profile), ...result.missing]));
  }

  async function handleDescribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!token || busy || text.length === 0) return;
    setBusy(true);
    setError(null);
    setDraft("");
    pushMessage("student", text);
    try {
      const body: AiProfileExtractRequest = { text, language };
      const result = await apiRequest<AiProfileExtractResponse>("/api/ai/profile/extract", {
        method: "POST",
        token,
        body,
      });
      setExtraction(result);
      if (confirmKeys(result).length > 0) {
        pushMessage(
          "assistant",
          "I found these details. Check each one, correct anything that is wrong, and fill in any blanks.",
        );
        setStage("confirm");
      } else {
        pushMessage(
          "assistant",
          "I could not find any details in that message. Please describe your situation again.",
        );
      }
    } catch {
      setDraft(text);
      setError("Could not read your details right now. Your message is still here; please try again.");
    } finally {
      setBusy(false);
    }
  }

  function finish(finalProfile: Record<string, AttributeValue>) {
    setProfile(finalProfile);
    setStage("done");
    pushMessage("assistant", "Thank you. Your details are confirmed for this visit.");
  }

  async function handleConfirm(confirmed: Record<string, AttributeValue>) {
    if (!token || !extraction || busy) return;
    setError(null);
    const stillMissing = extraction.missing.filter((key) => isBlank(confirmed[key]));
    if (stillMissing.length === 0) {
      finish(confirmed);
      return;
    }
    setProfile(confirmed);
    const asked = stillMissing.slice(0, MAX_FOLLOWUP_KEYS);
    setBusy(true);
    try {
      const body: AiFollowUpsRequest = { missing: asked, language };
      const result = await apiRequest<AiFollowUpsResponse>("/api/ai/follow-ups", {
        method: "POST",
        token,
        body,
      });
      setFollowUpKeys(asked);
      setFollowUpQuestions(result.questions);
      pushMessage("assistant", "A few details are still missing. Please answer these questions.");
      setStage("followups");
    } catch {
      setError("Could not load follow-up questions right now. Please confirm your details again.");
    } finally {
      setBusy(false);
    }
  }

  function handleFollowUps(answers: string[]) {
    if (!profile) return;
    const updated: Record<string, AttributeValue> = { ...profile };
    followUpKeys.forEach((key, index) => {
      const text = (answers[index] ?? "").trim();
      if (text.length > 0) updated[key] = text;
    });
    const answeredAny = followUpKeys.some((key) => !isBlank(updated[key]));
    pushMessage(
      "student",
      answeredAny ? "I answered the follow-up questions." : "I skipped the follow-up questions.",
    );
    finish(updated);
  }

  function startAgain() {
    setMessages([]);
    setStage("describe");
    setDraft("");
    setError(null);
    setExtraction(null);
    setFollowUpKeys([]);
    setFollowUpQuestions([]);
    setProfile(null);
  }

  return (
    <section className="space-y-6">
      <aside
        aria-label="Important information"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <p>
          The assistant helps read your details and explain results. It does not decide
          eligibility; eligibility comes from fixed rules. Do not enter ID numbers such as Aadhaar.
        </p>
      </aside>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Conversation</h2>
        {messages.length === 0 ? (
          <p className="text-sm text-slate-600">
            Describe your situation in Telugu or English to begin.
          </p>
        ) : (
          <ol aria-label="Conversation" aria-live="polite" className="space-y-3">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`rounded-lg p-3 text-sm ${
                  message.from === "student"
                    ? "ml-auto max-w-prose bg-blue-50 text-slate-900"
                    : "mr-auto max-w-prose bg-slate-100 text-slate-900"
                }`}
              >
                <p className="text-xs font-medium text-slate-600">
                  {message.from === "student" ? "You" : "YOGYA assistant"}
                </p>
                <p className="whitespace-pre-line">{message.text}</p>
              </li>
            ))}
          </ol>
        )}
        {busy ? <Spinner label="Working" /> : null}
        {error ? <ErrorMessage message={error} /> : null}
      </Card>

      {stage === "describe" ? (
        <Card>
          <form onSubmit={handleDescribe} className="space-y-4" aria-label="Describe your circumstances">
            <div className="flex flex-col gap-1">
              <label htmlFor={textareaId} className="text-sm font-medium text-slate-700">
                Describe your circumstances (Telugu or English)
              </label>
              <textarea
                id={textareaId}
                name="circumstances"
                rows={4}
                maxLength={MAX_TEXT_CHARS}
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
                aria-describedby={`${textareaId}-hint`}
                className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
              />
              <p id={`${textareaId}-hint`} className="text-xs text-slate-600">
                Do not enter ID numbers such as Aadhaar. Maximum {MAX_TEXT_CHARS} characters.
              </p>
            </div>
            <div className="flex flex-col gap-1 sm:max-w-xs">
              <label htmlFor={languageId} className="text-sm font-medium text-slate-700">
                Language for replies
              </label>
              <select
                id={languageId}
                value={language}
                disabled={busy}
                onChange={(event) => setLanguage(event.target.value === "te" ? "te" : "en")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
              >
                <option value="en">English</option>
                <option value="te">Telugu</option>
              </select>
            </div>
            <Button type="submit" variant="primary" disabled={busy || draft.trim().length === 0 || !token}>
              Send
            </Button>
          </form>
        </Card>
      ) : null}

      {stage === "confirm" && extraction ? (
        <Card>
          <ProfileConfirmForm
            initialProfile={extraction.profile}
            keys={confirmKeys(extraction)}
            disabled={busy}
            onConfirm={handleConfirm}
          />
        </Card>
      ) : null}

      {stage === "followups" ? (
        <Card>
          <FollowUpForm
            questions={followUpQuestions}
            keys={followUpKeys}
            disabled={busy}
            onSubmit={handleFollowUps}
          />
        </Card>
      ) : null}

      {stage === "done" && profile ? (
        <section className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Your confirmed details</h2>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {Object.entries(profile).map(([key, value]) => (
                <div key={key}>
                  <dt className="font-medium text-slate-700">{humanizeKey(key)}</dt>
                  <dd className="text-slate-900">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-slate-600">
              Confirmed details stay on this page. Saving them to your profile is not available yet.
            </p>
          </Card>

          {schemeVersionId ? (
            <SchemeCheckPanel schemeVersionId={schemeVersionId} profile={profile} language={language} />
          ) : null}

          <Card className="space-y-3">
            <p className="text-sm text-slate-700">
              To check eligibility for a scholarship, choose one from the catalogue.
            </p>
            <Link href="/scholarships" className="inline-block text-accent-blue underline">
              Check eligibility
            </Link>
          </Card>

          <Button type="button" variant="secondary" onClick={startAgain}>
            Start again
          </Button>
        </section>
      ) : null}
    </section>
  );
}
