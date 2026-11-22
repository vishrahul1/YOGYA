"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setHasSession(data.session !== null);
      })
      .catch(() => {
        if (active) setHasSession(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setHasSession(session !== null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextPasswordError =
      password.length >= MIN_PASSWORD_LENGTH
        ? undefined
        : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    const nextConfirmError = confirmPassword === password ? undefined : "Passwords do not match.";
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (nextPasswordError || nextConfirmError) return;

    setSubmitting(true);
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password });
      if (error) {
        setFormError("Could not update your password. The reset link may have expired.");
        return;
      }
      setUpdated(true);
    } catch {
      setFormError("Could not update your password right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  let body: ReactNode;
  if (checking) {
    body = <Spinner />;
  } else if (!hasSession) {
    body = (
      <ErrorMessage message="This reset link is invalid or has expired. Request a new reset link to continue." />
    );
  } else if (updated) {
    body = (
      <p role="status" className="text-slate-700">
        Your password has been updated.{" "}
        <Link href="/login" className="text-accent-blue underline">
          Log in with your new password
        </Link>
        .
      </p>
    );
  } else {
    body = (
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {formError ? <ErrorMessage message={formError} /> : null}
        <Input
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
          required
        />
        <Input
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmError}
          required
        />
        <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full">
          {submitting ? "Updating..." : "Update password"}
        </Button>
      </form>
    );
  }

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
      <Card>{body}</Card>
      <p className="text-sm text-slate-600">
        <Link href="/forgot-password" className="text-accent-blue underline">
          Request a new reset link
        </Link>
      </p>
    </section>
  );
}
