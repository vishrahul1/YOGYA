"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { AttributeValue } from "@/lib/api/types";

export interface ProfileConfirmFormProps {
  /** Attributes returned by the extraction step. */
  initialProfile: Record<string, AttributeValue>;
  /** Keys to show: extracted keys plus keys the backend reported as missing. */
  keys: string[];
  disabled?: boolean;
  onConfirm: (profile: Record<string, AttributeValue>) => void;
}

/** "annual_income" -> "Annual income". Only for display; the key itself is sent unchanged. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toDraft(value: AttributeValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Converts the edited text back to the type the extraction returned, where that is unambiguous.
 * Text that cannot be converted is kept as a string.
 */
function fromDraft(original: AttributeValue | undefined, text: string): AttributeValue {
  if (text === "") return null;
  if (Array.isArray(original)) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  if (typeof original === "number") {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : text;
  }
  if (typeof original === "boolean") {
    const lowered = text.toLowerCase();
    if (lowered === "true" || lowered === "yes") return true;
    if (lowered === "false" || lowered === "no") return false;
    return text;
  }
  return text;
}

export default function ProfileConfirmForm({
  initialProfile,
  keys,
  disabled = false,
  onConfirm,
}: ProfileConfirmFormProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(keys.map((key) => [key, toDraft(initialProfile[key])])),
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmed: Record<string, AttributeValue> = {};
    for (const key of keys) {
      confirmed[key] = fromDraft(initialProfile[key], (drafts[key] ?? "").trim());
    }
    onConfirm(confirmed);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Confirm your details">
      <p className="text-sm text-slate-700">
        Check each detail below. Correct anything that is wrong and fill in anything that is blank.
        Do not enter ID numbers such as Aadhaar.
      </p>
      {keys.length === 0 ? (
        <p className="text-sm text-slate-700">No details were found. Describe your situation again.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {keys.map((key) => (
            <Input
              key={key}
              id={`profile-${key}`}
              name={key}
              label={humanizeKey(key)}
              value={drafts[key] ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setDrafts((prev) => ({ ...prev, [key]: event.target.value }))
              }
            />
          ))}
        </div>
      )}
      <Button type="submit" variant="primary" disabled={disabled}>
        Confirm details
      </Button>
    </form>
  );
}
