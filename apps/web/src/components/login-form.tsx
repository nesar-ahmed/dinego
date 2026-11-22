"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getFieldErrors } from "@/lib/api";
import { loginSession } from "@/lib/auth-client";
import { dashboardPathFor } from "@/lib/dashboards";
import { getSafeNextPath } from "@/lib/navigation";
import { Field, FormError, SubmitButton } from "@/components/form";
import { PasswordField } from "@/components/password-field";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const result = await loginSession({ email, password });

      if ("customer" in result) {
        const next = getSafeNextPath("/account");
        const staffOnly = next.startsWith("/admin") || next.startsWith("/staff");
        router.replace(staffOnly ? "/account" : next);
      } else {
        // Admins and managers use the admin console; kitchen, waiters, and cashiers their boards.
        const home = dashboardPathFor(result.user.role);
        router.replace(getSafeNextPath(home, home.startsWith("/staff") ? "/staff" : "/admin"));
      }

      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed.");
      setFieldErrors(getFieldErrors(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Login</h2>
        <p className="mt-1 text-sm text-muted">Sign in with your email and password.</p>
      </div>

      <FormError message={error} />

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
      />

      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        minLength={8}
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="At least 8 characters"
      />

      <SubmitButton loading={loading}>Login</SubmitButton>
    </form>
  );
}
