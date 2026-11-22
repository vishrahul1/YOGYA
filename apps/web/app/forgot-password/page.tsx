"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import { isValidEmail } from "@/lib/auth/validation";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextError = isValidEmail(email) ? undefined : "Enter a valid email address.";
    setEmailError(nextError);
    if (nextError) return;

    setSubmitting(true);
    try {
      // The same confirmation is shown whether or not an account exists,
      // so this page does not reveal which emails are registered.
      await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSent(true);
    } catch {
      setFormError("Could not send the reset email right now. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
      <Card>
        {sent ? (
          <p role="status" className="text-slate-700">
            If an account exists for that email, a password reset link has been sent. Check your
            inbox and spam folder.
          </p>
        ) : (
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            {formError ? <ErrorMessage message={formError} /> : null}
            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError}
              required
            />
            <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full">
              {submitting ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )}
      </Card>
      <p className="text-sm text-slate-600">
        <Link href="/login" className="text-accent-blue underline">
          Back to log in
        </Link>
      </p>
    </section>
  );
}
