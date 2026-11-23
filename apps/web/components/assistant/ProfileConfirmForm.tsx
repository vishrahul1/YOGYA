"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { AttributeValue } from "@/lib/api/types";

export interface ProfileConfirmFormProps {
  initialProfile: Record<string, AttributeValue>;
  keys: string[];
  disabled?: boolean;
  onConfirm: (profile: Record<string, AttributeValue>) => void;
  onContinue: (profile: Record<string, AttributeValue>) => void;
}

export function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toDraft(value: AttributeValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function fromDraft(original: AttributeValue | undefined, text: string): AttributeValue {
  if (text === "") return null;
  if (Array.isArray(original)) {
    return text.split(",").map((part) => part.trim()).filter(Boolean);
  }
  if (typeof original === "number") {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : text;
  }
  if (typeof original === "boolean") {
    const lowered = text.toLowerCase();
    if (lowered === "true" || lowered === "yes") return true;
    if (lowered === "false" || lowered === "no") return false;
  }
  return text;
}

export default function ProfileConfirmForm({
  initialProfile,
  keys,
  disabled = false,
  onConfirm,
  onContinue,
}: ProfileConfirmFormProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(keys.map((key) => [key, toDraft(initialProfile[key])])),
  );

  function currentProfile(): Record<string, AttributeValue> {
    return Object.fromEntries(
      keys.map((key) => [key, fromDraft(initialProfile[key], (drafts[key] ?? "").trim())]),
    );
  }

  function handleNext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentIndex < keys.length - 1) {
      setCurrentIndex((index) => index + 1);
      return;
    }
    onConfirm(currentProfile());
  }

  const key = keys[currentIndex];
  if (!key) return null;
  const lastStep = currentIndex === keys.length - 1;

  return (
    <form onSubmit={handleNext} className="space-y-5" aria-label="Review extracted details">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Review what I found</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Is this detail correct?</h2>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {currentIndex + 1} of {keys.length}
        </span>
      </div>

      <Input
        key={key}
        id={`profile-${key}`}
        name={key}
        label={humanizeKey(key)}
        value={drafts[key] ?? ""}
        disabled={disabled}
        autoFocus
        onChange={(event) => setDrafts((previous) => ({ ...previous, [key]: event.target.value }))}
      />

      <div className="flex flex-wrap gap-3">
        {currentIndex > 0 ? (
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => setCurrentIndex((index) => index - 1)}>
            Back
          </Button>
        ) : null}
        <Button type="submit" disabled={disabled}>
          {lastStep ? "Looks right" : "Next"}
        </Button>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => onContinue(currentProfile())}>
          Continue with these details
        </Button>
      </div>
    </form>
  );
}
