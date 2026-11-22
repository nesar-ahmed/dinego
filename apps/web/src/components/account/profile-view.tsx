"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccountPageHeader, useAccount } from "./account-shell";
import { DetailsForm, EmailForm, PasswordForm, type FormProps } from "./profile-forms";
import { FormStatus, SettingsSection } from "./settings-section";

type Row = { label: string; value: ReactNode };

/**
 * One part of the profile: read-only rows with an action button, which opens its form in place.
 * After saving or cancelling, focus returns to the button and a confirmation is shown.
 */
function EditableSection({
  anchor,
  title,
  description,
  rows,
  actionLabel,
  Form,
}: {
  anchor: string;
  title: string;
  description: ReactNode;
  rows: Row[];
  actionLabel: string;
  Form: (props: FormProps) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      actionRef.current?.focus();
    }
  }, [editing]);

  const close = (message?: string) => {
    restoreFocus.current = true;
    setNotice(message ?? null);
    setEditing(false);
  };

  return (
    <SettingsSection anchor={anchor} title={title} description={description}>
      {editing ? (
        <Form onDone={(message) => close(message)} onCancel={() => close()} />
      ) : (
        <div>
          <dl className="divide-y divide-line border-y border-line">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 py-3.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]"
              >
                <dt className="text-muted">{row.label}</dt>
                <dd className="break-words font-medium text-fg">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              ref={actionRef}
              type="button"
              onClick={() => {
                setNotice(null);
                setEditing(true);
              }}
              className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg transition hover:border-fg"
            >
              {actionLabel}
            </button>
            <FormStatus tone="success" message={notice} />
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

export function ProfileView() {
  const { customer } = useAccount();

  // Sections render after the account loads, so scroll to a deep link (#email, #password) then.
  useEffect(() => {
    const target = window.location.hash ? document.querySelector(window.location.hash) : null;
    target?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div>
      <AccountPageHeader
        title="Profile"
        description="Your details, the email you sign in with, and your password. Each is updated on its own."
      />

      <EditableSection
        anchor="details"
        title="Personal details"
        description="How we greet you, and how we can reach you about an order."
        rows={[
          { label: "Name", value: customer.name },
          {
            label: "Phone",
            value: customer.phone ?? <span className="font-normal text-muted">Not added</span>,
          },
        ]}
        actionLabel="Edit details"
        Form={DetailsForm}
      />

      <EditableSection
        anchor="email"
        title="Email address"
        description="You sign in with this email. Changing it needs your current password."
        rows={[{ label: "Email", value: customer.email }]}
        actionLabel="Change email"
        Form={EmailForm}
      />

      <EditableSection
        anchor="password"
        title="Password"
        description="Changing your password signs you out on every other phone, tablet, and browser. You stay signed in here."
        rows={[
          {
            label: "Password",
            value: (
              <span className="tracking-[0.25em]" aria-label="Hidden">
                ••••••••
              </span>
            ),
          },
        ]}
        actionLabel="Change password"
        Form={PasswordForm}
      />
    </div>
  );
}
