"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorMessage from "@/components/ui/ErrorMessage";
import Input from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/session";
import { isValidEmail } from "@/lib/auth/validation";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const { session, role, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session && role) {
      router.replace(role === "admin" ? "/admin" : "/dashboard");
    }
  }, [loading, session, role, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextEmailError = isValidEmail(email) ? undefined : "Enter a valid email address.";
    const nextPasswordError = password.length > 0 ? undefined : "Enter your password.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    setSubmitting(true);
    try {
      const { data, error } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.session) {
        setFormError("Sign-in failed. Check your email and password and try again.");
        return;
      }

      // Leave the login route immediately. The dashboard guard will forward an
      // admin to the admin workspace once AuthProvider resolves the role.
      router.replace("/dashboard");
    } catch {
      setFormError("Could not sign in right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Log in</h1>
      <Card>
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
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
            required
          />
          <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full">
            {submitting ? "Logging in..." : "Log in"}
          </Button>
        </form>
      </Card>
      <ul className="space-y-2 text-sm text-slate-600">
        <li>
          New student?{" "}
          <Link href="/register" className="text-accent-blue underline">
            Create an account
          </Link>
        </li>
        <li>
          <Link href="/forgot-password" className="text-accent-blue underline">
            Forgot password?
          </Link>
        </li>
      </ul>
    </section>
  );
}
