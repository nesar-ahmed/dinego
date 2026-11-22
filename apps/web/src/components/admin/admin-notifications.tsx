"use client";

import { NOTIFICATION_RETENTION_DAYS } from "@dinego/shared";
import { NotificationInbox, type InboxTopic } from "@/components/notifications/notification-inbox";

/**
 * What the admin console's staff (ADMIN and MANAGER) are notified about: new and stopped orders,
 * payment provider outages, table layout changes, and new customer accounts.
 */
const STAFF_TOPICS: InboxTopic[] = [
  { value: "ORDER", label: "Orders" },
  { value: "PAYMENT", label: "Payments" },
  { value: "FLOOR", label: "Tables" },
  { value: "ACCOUNT", label: "Accounts" },
];

/** The signed-in staff member's notifications, in the admin console. */
export function AdminNotifications() {
  return (
    <NotificationInbox
      topics={STAFF_TOPICS}
      gutter={3}
      emptyText="New orders, customer sign-ups, and floor changes will show up here."
      renderHeader={(markAll) => (
        <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-soft">
              Inbox
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">Notifications</h1>
            <p className="mt-1 text-sm text-muted">
              Orders, payments, tables, and customer accounts. We keep them for{" "}
              {NOTIFICATION_RETENTION_DAYS} days.
            </p>
          </div>
          <button
            type="button"
            onClick={markAll.onClick}
            disabled={markAll.disabled}
            className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-fg transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-strong"
          >
            Mark all as read
          </button>
        </header>
      )}
    />
  );
}
