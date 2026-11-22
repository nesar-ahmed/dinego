"use client";

import { NOTIFICATION_RETENTION_DAYS } from "@dinego/shared";
import { NotificationInbox, type InboxTopic } from "@/components/notifications/notification-inbox";
import { AccountPageHeader } from "./account-shell";

/** Customers only receive these categories (floor and system notifications are for staff). */
const CUSTOMER_TOPICS: InboxTopic[] = [
  { value: "ORDER", label: "Orders" },
  { value: "PAYMENT", label: "Payments" },
  { value: "ACCOUNT", label: "Account" },
];

/** The customer's notifications page in the customer panel. */
export function NotificationsView() {
  return (
    <NotificationInbox
      topics={CUSTOMER_TOPICS}
      emptyText="Order updates and account alerts will show up here."
      emptyAction={{ href: "/menu", label: "Browse the menu" }}
      renderHeader={(markAll) => (
        <AccountPageHeader
          title="Notifications"
          description={`Updates about your orders and your account. We keep them for ${NOTIFICATION_RETENTION_DAYS} days.`}
          actions={
            <button
              type="button"
              onClick={markAll.onClick}
              disabled={markAll.disabled}
              className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-strong"
            >
              Mark all as read
            </button>
          }
        />
      )}
    />
  );
}
