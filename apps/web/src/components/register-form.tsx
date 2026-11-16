"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getFieldErrors } from "@/lib/api";
import { registerCustomer } from "@/lib/auth-client";
import { getSafeNextPath } from "@/lib/navigation";
import { Field, FormError, SubmitButton } from "@/components/form";
import { PasswordField } from "@/components/password-field";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
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
      await registerCustomer({ name, email, password });
      router.replace(getSafeNextPath("/account"));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed.");
      setFieldErrors(getFieldErrors(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Register</h2>
        <p className="mt-1 text-sm text-muted">Sign up with your email and password.</p>
      </div>

      <FormError message={error} />

      <Field
        label="Full name"
        name="name"
        autoComplete="name"
        required
        minLength={2}
        value={name}
        error={fieldErrors.name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Sofia Alvarez"
      />

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
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="At least 8 characters"
        hint="Use 8–128 characters."
      />

      <SubmitButton loading={loading}>Register</SubmitButton>
    </form>
  );
}
