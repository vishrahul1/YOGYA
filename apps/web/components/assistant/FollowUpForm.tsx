"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const QUICK_OPTIONS: Record<string, Array<{ label: string; value: string }>> = {
  caste_category: ["SC", "ST", "BC", "OC", "EWS", "MINORITY"].map((value) => ({
    label: value === "MINORITY" ? "Minority" : value,
    value,
  })),
  gender: [
    { label: "Female", value: "female" },
    { label: "Male", value: "male" },
    { label: "Other", value: "other" },
  ],
  course_level: [
    { label: "Intermediate", value: "intermediate" },
    { label: "Undergraduate", value: "undergraduate" },
    { label: "Postgraduate", value: "postgraduate" },
    { label: "Other", value: "other" },
  ],
};

export interface FollowUpFormProps {
  questions: string[];
  keys: string[];
  disabled?: boolean;
  onSubmit: (answers: string[]) => void;
}

export default function FollowUpForm({ questions, keys, disabled = false, onSubmit }: FollowUpFormProps) {
  const aligned = questions.length === keys.length && questions.length > 0;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  function complete(nextAnswers = answers) {
    onSubmit(aligned ? nextAnswers.map((answer) => answer.trim()) : []);
  }

  function moveNext(nextAnswers = answers) {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((index) => index + 1);
    } else {
      complete(nextAnswers);
    }
  }

  function handleNext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    moveNext();
  }

  if (!aligned) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700">I could not prepare the missing-detail questions.</p>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => onSubmit([])}>
          Continue with available details
        </Button>
      </div>
    );
  }

  const key = keys[currentIndex];
  const question = questions[currentIndex];
  const options = QUICK_OPTIONS[key] ?? [];
  const lastStep = currentIndex === questions.length - 1;

  return (
    <form onSubmit={handleNext} className="space-y-5" aria-label="Answer missing-detail questions">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">One more detail</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{question}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {currentIndex + 1} of {questions.length}
        </span>
      </div>

      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={question}>
          {options.map((option) => {
            const selected = answers[currentIndex] === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => setAnswers((previous) => previous.map((answer, index) => index === currentIndex ? option.value : answer))}
                className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue disabled:opacity-60 ${
                  selected
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : (
        <Input
          key={key}
          id={`followup-${key}`}
          name={key}
          label="Your answer"
          type={key === "age" || key === "annual_family_income_inr" ? "number" : "text"}
          min={key === "age" || key === "annual_family_income_inr" ? 0 : undefined}
          value={answers[currentIndex] ?? ""}
          disabled={disabled}
          autoFocus
          onChange={(event) => setAnswers((previous) => previous.map((answer, index) => index === currentIndex ? event.target.value : answer))}
        />
      )}

      <div className="flex flex-wrap gap-3">
        {currentIndex > 0 ? (
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => setCurrentIndex((index) => index - 1)}>
            Back
          </Button>
        ) : null}
        <Button type="submit" disabled={disabled || !(answers[currentIndex] ?? "").trim()}>
          {lastStep ? "Finish" : "Next"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            const nextAnswers = answers.map((answer, index) => index === currentIndex ? "" : answer);
            setAnswers(nextAnswers);
            moveNext(nextAnswers);
          }}
        >
          Skip this question
        </Button>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => complete()}>
          Continue with available details
        </Button>
      </div>
    </form>
  );
}
