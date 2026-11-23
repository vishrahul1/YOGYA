"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import FollowUpForm from "@/components/assistant/FollowUpForm";
import ProfileConfirmForm, { humanizeKey } from "@/components/assistant/ProfileConfirmForm";
import SchemeCheckPanel from "@/components/assistant/SchemeCheckPanel";
import VoiceInputButton from "@/components/assistant/VoiceInputButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Spinner from "@/components/ui/Spinner";
import { apiRequest } from "@/lib/api/client";
import type {
  AiChatRequest,
  AiChatResponse,
  AiLanguage,
  AiProfileExtractResponse,
  AttributeValue,
  SchemeListItem,
  SchemeListResponse,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/session";

/** Mirrors the backend limits in schemas/ai.py. */
const MAX_TEXT_CHARS = 2000;
const MAX_FOLLOWUP_KEYS = 10;

type Stage = "describe" | "confirm" | "followups" | "done";

interface ChatMessage {
  id: number;
  from: "student" | "assistant";
  text: string;
}

interface SavedConversation {
  id: string;
  title: string;
  updatedAt: string;
  language: AiLanguage;
  messages: ChatMessage[];
  profile: Record<string, AttributeValue> | null;
}

const SAVED_CHAT_PREFIX = "yogya.saved-conversations.";

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
  compact?: boolean;
}

export default function AssistantChat({ schemeVersionId, compact = false }: AssistantChatProps) {
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
  const [reviewKeys, setReviewKeys] = useState<string[]>([]);

  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<SchemeListItem[]>([]);
  const [schemesOpen, setSchemesOpen] = useState(false);
  const [schemesBusy, setSchemesBusy] = useState(false);
  const [schemesError, setSchemesError] = useState<string | null>(null);

  const textareaId = useId();
  const languageId = useId();
  const conversationEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, stage, busy]);

  const savedChatKey = session?.user.id ? `${SAVED_CHAT_PREFIX}${session.user.id}` : null;

  useEffect(() => {
    if (!savedChatKey) {
      setSavedConversations([]);
      return;
    }
    try {
      const value = window.localStorage.getItem(savedChatKey);
      setSavedConversations(value ? (JSON.parse(value) as SavedConversation[]) : []);
    } catch {
      setSavedConversations([]);
    }
  }, [savedChatKey]);

  useEffect(() => {
    if (!savedChatKey || messages.length === 0) return;
    const timer = window.setTimeout(() => {
      const id = activeConversationId ?? crypto.randomUUID();
      const firstMessage = messages.find((message) => message.from === "student")?.text;
      const item: SavedConversation = {
        id,
        title: (firstMessage ?? "Scholarship conversation").slice(0, 60),
        updatedAt: new Date().toISOString(),
        language,
        messages,
        profile,
      };
      setSavedConversations((current) => {
        const next = [item, ...current.filter((saved) => saved.id !== id)].slice(0, 30);
        window.localStorage.setItem(savedChatKey, JSON.stringify(next));
        return next;
      });
      setActiveConversationId(id);
      setSaveNotice("Saved automatically");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeConversationId, language, messages, profile, savedChatKey]);

  function storeConversations(items: SavedConversation[]) {
    setSavedConversations(items);
    if (savedChatKey) window.localStorage.setItem(savedChatKey, JSON.stringify(items));
  }

  function openConversation(item: SavedConversation) {
    setMessages(item.messages);
    nextMessageId.current = Math.max(0, ...item.messages.map((message) => message.id));
    setProfile(item.profile);
    setLanguage(item.language);
    setStage(item.profile ? "done" : "describe");
    setActiveConversationId(item.id);
    setHistoryOpen(false);
    setSaveNotice(null);
    setError(null);
  }

  function deleteConversation(id: string) {
    storeConversations(savedConversations.filter((item) => item.id !== id));
    if (activeConversationId === id) setActiveConversationId(null);
  }

  async function browseSchemes() {
    setSchemesOpen(true);
    if (schemes.length > 0 || schemesBusy) return;
    setSchemesBusy(true);
    setSchemesError(null);
    try {
      const result = await apiRequest<SchemeListResponse>("/api/schemes?limit=6&offset=0");
      setSchemes(result.items);
    } catch {
      setSchemesError("Could not load scholarships right now. Please try again.");
    } finally {
      setSchemesBusy(false);
    }
  }

  function pushMessage(from: ChatMessage["from"], text: string) {
    nextMessageId.current += 1;
    const id = nextMessageId.current;
    setMessages((prev) => [...prev, { id, from, text }]);
  }

  function startFollowUps(
    result: AiProfileExtractResponse,
    confirmed: Record<string, AttributeValue>,
  ) {
    const asked = result.missing.filter((key) => isBlank(confirmed[key])).slice(0, MAX_FOLLOWUP_KEYS);
    if (asked.length === 0) {
      finish(confirmed);
      return;
    }

    const questionsByKey = new Map(result.followup_questions.map((question) => [question.key, question]));
    const questions = asked.map((key) => {
      const question = questionsByKey.get(key);
      return question?.[language] ?? `Please tell me your ${humanizeKey(key).toLowerCase()}.`;
    });
    setProfile(confirmed);
    setFollowUpKeys(asked);
    setFollowUpQuestions(questions);
    pushMessage(
      "assistant",
      `I found ${Object.keys(confirmed).length} detail${Object.keys(confirmed).length === 1 ? "" : "s"}. I’ll ask only what is still missing, one question at a time.`,
    );
    setStage("followups");
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
      const currentProfile = profile ?? {};
      const body: AiChatRequest = {
        message: text,
        language,
        profile: currentProfile,
        history: messages.slice(-10).map((message) => ({
          role: message.from === "student" ? "user" : "assistant",
          content: message.text,
        })),
        ...(schemeVersionId ? { scheme_version_id: schemeVersionId } : {}),
      };
      const result = await apiRequest<AiChatResponse>("/api/ai/chat", {
        method: "POST",
        token,
        body,
      });
      setExtraction(result);
      pushMessage("assistant", result.reply);
      const changedKeys = Object.keys(result.profile).filter(
        (key) => JSON.stringify(result.profile[key]) !== JSON.stringify(currentProfile[key]),
      );
      if (changedKeys.length > 0) {
        setReviewKeys(changedKeys);
        setStage("confirm");
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
    pushMessage(
      "assistant",
      "Thank you. I’ll continue with the details you provided. Anything missing will remain unknown.",
    );
  }

  function handleContinueWithAvailable(confirmed: Record<string, AttributeValue>) {
    setError(null);
    pushMessage("student", "Continue with the details already available.");
    finish({ ...(profile ?? {}), ...confirmed });
  }

  function handleConfirm(confirmed: Record<string, AttributeValue>) {
    if (!extraction || busy) return;
    setError(null);
    startFollowUps(extraction, { ...(profile ?? {}), ...confirmed });
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
    setReviewKeys([]);
    setActiveConversationId(null);
    setSaveNotice(null);
    setSchemesOpen(false);
  }

  return (
    <section className={`relative flex w-full flex-col ${compact ? "h-full min-h-0" : "min-h-[calc(100vh-6rem)]"}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4 sm:gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-700 font-bold text-white shadow-sm">
          Y
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-slate-950">YOGYA Assistant</h1>
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="Available" />
          </div>
          <p className="truncate text-sm text-slate-500">Scholarship and eligibility guidance</p>
        </div>
        {!compact ? <button
          type="button"
          onClick={() => setHistoryOpen((value) => !value)}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          History{savedConversations.length ? ` (${savedConversations.length})` : ""}
        </button> : null}
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={startAgain}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          >
            New chat
          </button>
        ) : null}
      </header>

      {saveNotice ? <p className="mt-3 text-right text-sm font-medium text-emerald-700">{saveNotice}</p> : null}
      {historyOpen && !compact ? (
        <>
        <button type="button" aria-label="Close conversation history" onClick={() => setHistoryOpen(false)} className="fixed inset-0 z-40 bg-slate-950/20" />
        <aside className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-sm overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl" aria-label="Saved conversations">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-950">Saved conversations</h2>
            <button type="button" onClick={() => setHistoryOpen(false)} className="text-sm text-slate-500">Close</button>
          </div>
          {savedConversations.length === 0 ? <p className="text-sm text-slate-600">No saved conversations yet. Start chatting, then select Save chat.</p> : (
            <ul className="space-y-2">
              {savedConversations.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
                  <button type="button" onClick={() => openConversation(item)} className="min-w-0 flex-1 px-2 py-1 text-left">
                    <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
                    <span className="text-xs text-slate-500">{new Date(item.updatedAt).toLocaleString()}</span>
                  </button>
                  <button type="button" onClick={() => deleteConversation(item.id)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50" aria-label={`Delete ${item.title}`}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        </>
      ) : null}

      <div className={`flex-1 py-4 ${compact ? "min-h-0 overflow-y-auto px-1" : "w-full"}`}>
        <ol aria-label="Conversation" aria-live="polite" className="space-y-6">
          <li className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-xs font-bold text-white">Y</span>
            <div className="max-w-2xl rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm ring-1 ring-slate-200">
              <p className="font-medium text-slate-950">Hello! Tell me about your education and circumstances.</p>
              <p className="mt-1">Write naturally in English or Telugu, or use voice input. I will ask only for details that are missing.</p>
              <button type="button" onClick={() => void browseSchemes()} className="mt-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 font-semibold text-teal-800 hover:bg-teal-100">
                Browse scholarships here
              </button>
            </div>
          </li>

          {messages.map((message) => (
            <li key={message.id} className={`flex items-start gap-3 ${message.from === "student" ? "justify-end" : ""}`}>
              {message.from === "assistant" ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-xs font-bold text-white">Y</span>
              ) : null}
              <div
                className={`max-w-2xl whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.from === "student"
                    ? "rounded-tr-md bg-slate-900 text-white"
                    : "rounded-tl-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
                }`}
              >
                {message.text}
              </div>
            </li>
          ))}

          {busy ? (
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-xs font-bold text-white">Y</span>
              <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
                <Spinner label="Reading your message" />
              </div>
            </li>
          ) : null}
        </ol>

        {error ? <div className="mt-5"><ErrorMessage message={error} /></div> : null}

        {stage === "confirm" && extraction ? (
          <div className="mt-6 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-xs font-bold text-white">Y</span>
            <div className="min-w-0 max-w-2xl flex-1 rounded-2xl rounded-tl-md bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <ProfileConfirmForm
                initialProfile={extraction.profile}
                keys={reviewKeys}
                disabled={busy}
                onConfirm={handleConfirm}
                onContinue={handleContinueWithAvailable}
              />
            </div>
          </div>
        ) : null}

        {stage === "followups" ? (
          <div className="mt-6 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-xs font-bold text-white">Y</span>
            <div className="min-w-0 max-w-2xl flex-1 rounded-2xl rounded-tl-md bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <FollowUpForm
                questions={followUpQuestions}
                keys={followUpKeys}
                disabled={busy}
                onSubmit={handleFollowUps}
              />
            </div>
          </div>
        ) : null}

        {stage === "done" && profile ? (
          <div className="mt-6 space-y-5">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-xs font-bold text-white">Y</span>
              <Card className="min-w-0 max-w-2xl flex-1 space-y-4 rounded-tl-md p-5">
                <h2 className="font-semibold text-slate-950">Details for this visit</h2>
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  {Object.entries(profile).map(([key, value]) => (
                    <div key={key} className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-xs font-medium text-slate-500">{humanizeKey(key)}</dt>
                      <dd className="mt-1 font-medium text-slate-900">{formatValue(value)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-slate-500">These details stay on this page for the current visit.</p>
              </Card>
            </div>

            {schemeVersionId ? (
              <SchemeCheckPanel schemeVersionId={schemeVersionId} profile={profile} language={language} />
            ) : (
              <div className="flex items-start gap-3">
                <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-sm text-slate-700">Choose a scholarship to run a rule-based eligibility check.</p>
                  <button type="button" onClick={() => void browseSchemes()} className="mt-3 inline-flex font-semibold text-teal-700 underline underline-offset-4">
                    Browse scholarships here
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {schemesOpen ? (
          <div className="mt-6 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-xs font-bold text-white">Y</span>
            <div className="min-w-0 max-w-2xl flex-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-950">Published scholarships</h2>
                <button type="button" onClick={() => setSchemesOpen(false)} className="text-sm text-slate-500">Hide</button>
              </div>
              {schemesBusy ? <div className="mt-4"><Spinner label="Loading scholarships" /></div> : null}
              {schemesError ? <div className="mt-4"><ErrorMessage message={schemesError} /></div> : null}
              {!schemesBusy && !schemesError && schemes.length === 0 ? <p className="mt-3 text-sm text-slate-600">No published scholarships are available yet.</p> : null}
              <ul className="mt-3 divide-y divide-slate-100">
                {schemes.map((scheme) => (
                  <li key={scheme.scheme_version_id} className="py-3">
                    <h3 className="text-sm font-semibold text-slate-900">{scheme.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{scheme.benefit_summary ?? "Review the published details and official source."}</p>
                    <Link href={`/scholarships/${scheme.scheme_version_id}`} className="mt-2 inline-flex text-sm font-semibold text-teal-700">View details →</Link>
                  </li>
                ))}
              </ul>
              <Link href="/scholarships" className="mt-3 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">View all scholarships</Link>
            </div>
          </div>
        ) : null}
        <div ref={conversationEndRef} />
      </div>

      {stage === "describe" || stage === "done" ? (
        <div className={`sticky bottom-0 w-full bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pb-2 ${compact ? "pt-2" : "pt-4"}`}>
          <form
            onSubmit={handleDescribe}
            className="rounded-3xl border border-slate-300 bg-white p-3 shadow-xl shadow-slate-300/30 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100"
            aria-label="Message YOGYA assistant"
          >
            <label htmlFor={textareaId} className="sr-only">Message YOGYA Assistant</label>
            <textarea
              id={textareaId}
              name="circumstances"
              rows={2}
              maxLength={MAX_TEXT_CHARS}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              aria-describedby={`${textareaId}-hint`}
              placeholder="Message YOGYA Assistant..."
              className="block w-full resize-none border-0 bg-transparent px-2 py-2 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
            />
            <div className="mt-2 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor={languageId} className="sr-only">Language for replies</label>
                  <select
                    id={languageId}
                    value={language}
                    disabled={busy}
                    onChange={(event) => setLanguage(event.target.value === "te" ? "te" : "en")}
                    className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  >
                    <option value="en">English</option>
                    <option value="te">Telugu</option>
                  </select>
                </div>
                <VoiceInputButton
                  language={language}
                  disabled={busy}
                  onTranscript={(text) =>
                    setDraft((current) => `${current.trim()}${current.trim() ? " " : ""}${text}`.slice(0, MAX_TEXT_CHARS))
                  }
                />
              </div>
              <Button
                type="submit"
                disabled={busy || draft.trim().length === 0 || !token}
                className="min-h-10 rounded-xl bg-slate-900 px-5 hover:bg-slate-800"
              >
                Send
                <span aria-hidden="true" className="ml-2">↑</span>
              </Button>
            </div>
          </form>
          <p id={`${textareaId}-hint`} className="mt-2 text-center text-xs text-slate-500">
            Do not share Aadhaar or other ID numbers. Eligibility decisions come from fixed rules.
          </p>
        </div>
      ) : null}
    </section>
  );
}
