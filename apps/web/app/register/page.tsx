"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import { MIN_PASSWORD_LENGTH, isValidEmail } from "@/lib/auth/validation";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Student self-registration only. No role, metadata, or account-type field is
 * sent to Supabase; roles are assigned on the backend, never chosen by the user.
 */
export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string | undefined> = {
      fullName: fullName.trim().length > 0 ? undefined : "Enter your full name.",
      email: isValidEmail(email) ? undefined : "Enter a valid email address.",
      password:
        password.length >= MIN_PASSWORD_LENGTH
          ? undefined
          : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      confirmPassword: confirmPassword === password ? undefined : "Passwords do not match.",
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some((value) => value !== undefined)) return;

    setSubmitting(true);
    try {
      const { error } = await getSupabaseClient().auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        setFormError(error.message || "Could not create your account. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setFormError("Could not create your account right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
        <Card>
          <p className="text-slate-700">
            If email confirmation is required, we have sent a link to your inbox. Confirm your
            email, then log in.
          </p>
          <p className="mt-4">
            <Link href="/login" className="text-accent-blue underline">
              Go to log in
            </Link>
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Create a student account</h1>
      <Card>
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          {formError ? <ErrorMessage message={formError} /> : null}
          <Input
            label="Full name"
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={errors.fullName}
            required
          />
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            required
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
          />
          <Input
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            required
          />
          <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full">
            {submitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </Card>
      <p className="text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/login" className="text-accent-blue underline">
          Log in
        </Link>
      </p>
    </section>
  );
}
