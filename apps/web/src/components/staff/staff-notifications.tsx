"use client";

import { NOTIFICATION_RETENTION_DAYS } from "@dinego/shared";
import { NotificationInbox, type InboxTopic } from "@/components/notifications/notification-inbox";
import type { StaffDashboardRole } from "@/lib/dashboards";
import { useStaff } from "./staff-provider";

/**
 * What each role is notified about (notifications.catalog.ts). Kitchen: new and stopped orders.
 * Waiters: dine-in orders (new, ready, stopped), bill requests, and tables to clean.
 * Cashiers: takeaway orders (new, ready, stopped) and bill requests.
 */
const ROLE_TOPICS: Record<StaffDashboardRole, InboxTopic[]> = {
  KITCHEN: [{ value: "ORDER", label: "Orders" }],
  WAITER: [
    { value: "ORDER", label: "Orders" },
    { value: "FLOOR", label: "Tables" },
  ],
  CASHIER: [
    { value: "ORDER", label: "Orders" },
    { value: "FLOOR", label: "Tables" },
  ],
};

const ROLE_DESCRIPTIONS: Record<StaffDashboardRole, string> = {
  KITCHEN: "New orders to cook and orders that were cancelled.",
  WAITER: "Dine-in orders to serve, bill requests, and tables to clean.",
  CASHIER: "New takeaway orders, orders ready for pickup, and bill requests.",
};

const ROLE_EMPTY: Record<StaffDashboardRole, string> = {
  KITCHEN: "New orders and cancelled orders will show up here.",
  WAITER: "Dine-in orders ready to serve and tables to clean will show up here.",
  CASHIER: "New takeaway orders and orders ready for pickup will show up here.",
};

/** The signed-in staff member's notifications, in their dashboard. */
export function StaffNotifications() {
  const { role } = useStaff();

  return (
    <NotificationInbox
      topics={ROLE_TOPICS[role]}
      gutter={3}
      emptyText={ROLE_EMPTY[role]}
      renderHeader={(markAll) => (
        <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-soft">
              Inbox
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">Notifications</h1>
            <p className="mt-1 text-sm text-muted">
              {ROLE_DESCRIPTIONS[role]} We keep them for {NOTIFICATION_RETENTION_DAYS} days.
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
