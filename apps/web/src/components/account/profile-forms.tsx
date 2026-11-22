"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { changeEmailSchema, changePasswordSchema, updateProfileSchema } from "@dinego/shared";
import { Field } from "@/components/form";
import { PasswordField } from "@/components/password-field";
import { changeEmail, changePassword, updateProfile, zodFieldErrors } from "@/lib/account";
import { ApiError, getFieldErrors } from "@/lib/api";
import { useAccount } from "./account-shell";
import { FormStatus, SaveButton } from "./settings-section";

export type FormProps = {
  /** Called after a successful update with the confirmation to show. */
  onDone: (message: string) => void;
  onCancel: () => void;
};

/** Save failures: an ended session goes to sign in; otherwise field errors or one form error. */
function useFailureHandler() {
  const router = useRouter();

  return (
    error: unknown,
    setFieldErrors: (errors: Record<string, string>) => void,
    setFormError: (message: string | null) => void,
  ) => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent("/account/profile")}`);
      return;
    }

    const fields = getFieldErrors(error);
    setFieldErrors(fields);
    setFormError(
      Object.keys(fields).length > 0
        ? null
        : error instanceof Error
          ? error.message
          : "Could not save. Please try again.",
    );
  };
}

function FormShell({
  onSubmit,
  onCancel,
  saving,
  canSave,
  submitLabel,
  formError,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  saving: boolean;
  canSave: boolean;
  submitLabel: string;
  formError: string | null;
  children: ReactNode;
}) {
  // Escape cancels, like closing a dialog.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape" && !saving) onCancel();
  };

  return (
    <form onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate className="space-y-4">
      {children}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SaveButton saving={saving} disabled={!canSave}>
          {submitLabel}
        </SaveButton>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full px-4 py-2.5 text-sm font-semibold text-muted transition hover:text-fg disabled:opacity-50"
        >
          Cancel
        </button>
        <FormStatus tone="error" message={formError} />
      </div>
    </form>
  );
}

export function DetailsForm({ onDone, onCancel }: FormProps) {
  const { customer, setCustomer } = useAccount();
  const handleFailure = useFailureHandler();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameChanged = name.trim() !== customer.name;
  const phoneChanged = (phone.trim() || null) !== customer.phone;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = updateProfileSchema.safeParse({
      ...(nameChanged ? { name } : {}),
      ...(phoneChanged ? { phone } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      setCustomer(await updateProfile(parsed.data));
      onDone("Your details were updated.");
    } catch (error) {
      handleFailure(error, setFieldErrors, setFormError);
      setSaving(false);
    }
  }

  return (
    <FormShell
      onSubmit={onSubmit}
      onCancel={onCancel}
      saving={saving}
      canSave={nameChanged || phoneChanged}
      submitLabel="Save changes"
      formError={formError}
    >
      <Field
        label="Full name"
        name="name"
        autoComplete="name"
        autoFocus
        value={name}
        error={fieldErrors.name}
        onChange={(event) => setName(event.target.value)}
      />
      <Field
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        value={phone}
        placeholder="Optional"
        hint="Only used if we need to reach you about an order. Leave empty to remove it."
        error={fieldErrors.phone}
        onChange={(event) => setPhone(event.target.value)}
      />
    </FormShell>
  );
}

export function EmailForm({ onDone, onCancel }: FormProps) {
  const { customer, setCustomer } = useAccount();
  const handleFailure = useFailureHandler();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = changeEmailSchema.safeParse({ newEmail, currentPassword });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    if (parsed.data.newEmail === customer.email) {
      setFieldErrors({ newEmail: "This is already your email address" });
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      const updated = await changeEmail(parsed.data);
      setCustomer(updated);
      onDone(`Email changed. Sign in with ${updated.email} from now on.`);
    } catch (error) {
      handleFailure(error, setFieldErrors, setFormError);
      setSaving(false);
    }
  }

  return (
    <FormShell
      onSubmit={onSubmit}
      onCancel={onCancel}
      saving={saving}
      canSave={Boolean(newEmail.trim() && currentPassword)}
      submitLabel="Change email"
      formError={formError}
    >
      <Field
        label="New email"
        name="newEmail"
        type="email"
        autoComplete="email"
        autoFocus
        value={newEmail}
        placeholder="you@example.com"
        error={fieldErrors.newEmail}
        onChange={(event) => setNewEmail(event.target.value)}
      />
      <PasswordField
        label="Current password"
        name="currentPassword"
        id="email-current-password"
        autoComplete="current-password"
        value={currentPassword}
        hint="To confirm it's really you."
        error={fieldErrors.currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
    </FormShell>
  );
}

export function PasswordForm({ onDone, onCancel }: FormProps) {
  const handleFailure = useFailureHandler();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    const errors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (!errors.newPassword && newPassword !== confirmPassword) {
      errors.confirmPassword = "The passwords don't match";
    }
    if (!parsed.success || Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      await changePassword(parsed.data);
      onDone("Password changed. You've been signed out on your other devices.");
    } catch (error) {
      handleFailure(error, setFieldErrors, setFormError);
      setSaving(false);
    }
  }

  return (
    <FormShell
      onSubmit={onSubmit}
      onCancel={onCancel}
      saving={saving}
      canSave={Boolean(currentPassword && newPassword && confirmPassword)}
      submitLabel="Change password"
      formError={formError}
    >
      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        autoFocus
        value={currentPassword}
        error={fieldErrors.currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        value={newPassword}
        hint="At least 8 characters, different from your current one."
        error={fieldErrors.newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      <PasswordField
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        value={confirmPassword}
        error={fieldErrors.confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />
    </FormShell>
  );
}
