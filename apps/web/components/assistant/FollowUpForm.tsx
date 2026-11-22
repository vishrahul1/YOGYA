"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export interface FollowUpFormProps {
  /** Questions from POST /api/ai/follow-ups. */
  questions: string[];
  /** Profile keys that were asked, in the same order as the request's `missing` list. */
  keys: string[];
  disabled?: boolean;
  /** Answers are returned in the same order as `keys`; a blank answer means "no answer". */
  onSubmit: (answers: string[]) => void;
}

/**
 * Shows follow-up questions with an input each.
 * The follow-up response has no key per question, so question i is matched to keys[i].
 * If the counts differ, the match is unreliable and the questions are shown without inputs.
 */
export default function FollowUpForm({ questions, keys, disabled = false, onSubmit }: FollowUpFormProps) {
  const aligned = questions.length === keys.length;
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(aligned ? answers.map((answer) => answer.trim()) : []);
  }

  if (!aligned) {
    return (
      <div className="space-y-3">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
          {questions.map((question, index) => (
            <li key={index}>{question}</li>
          ))}
        </ul>
        <p className="text-sm text-slate-700">
          The assistant could not match these questions to fields. Please update your details
          directly and continue.
        </p>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => onSubmit([])}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Answer follow-up questions">
      <div className="grid grid-cols-1 gap-4">
        {questions.map((question, index) => (
          <Input
            key={keys[index]}
            id={`followup-${keys[index]}`}
            name={keys[index]}
            label={question}
            value={answers[index] ?? ""}
            disabled={disabled}
            onChange={(event) =>
              setAnswers((prev) => prev.map((value, i) => (i === index ? event.target.value : value)))
            }
          />
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          Save answers
        </Button>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => onSubmit([])}>
          Skip for now
        </Button>
      </div>
    </form>
  );
}
