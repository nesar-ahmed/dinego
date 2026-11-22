"use client";

import type { ReactNode } from "react";
import type { NotificationItem } from "@dinego/shared";
import { ConsoleShell, type ConsoleConfig } from "@/components/console/console-shell";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { STAFF_HOME, type StaffDashboardRole } from "@/lib/dashboards";
import { notificationHref } from "@/lib/notifications";
import { STAFF_NOTIFICATIONS_HREF, useStaff } from "./staff-provider";

export const WAITER_TABLES_HREF = "/staff/waiter/tables";

const notificationsNav = {
  href: STAFF_NOTIFICATIONS_HREF,
  label: "Notifications",
  icon: "bell",
} as const;

/** One console per role: its pages, wording, and what its bell says when empty. */
const CONSOLES: Record<StaffDashboardRole, ConsoleConfig> = {
  KITCHEN: {
    name: "Kitchen",
    consoleLabel: "Kitchen display",
    workspaceLabel: "Kitchen",
    homeHref: STAFF_HOME.KITCHEN,
    navigation: [
      { href: STAFF_HOME.KITCHEN, label: "Kitchen board", icon: "kitchen" },
      notificationsNav,
    ],
    pageTitles: {
      [STAFF_HOME.KITCHEN]: "Kitchen board",
      [STAFF_NOTIFICATIONS_HREF]: "Notifications",
    },
    notificationsHref: STAFF_NOTIFICATIONS_HREF,
    bellEmptyText: "New orders and cancelled orders will show up here.",
    sidebarStorageKey: "dinego-kitchen-sidebar-collapsed",
  },
  WAITER: {
    name: "Waiter",
    consoleLabel: "Floor service",
    workspaceLabel: "Dining room",
    homeHref: STAFF_HOME.WAITER,
    navigation: [
      { href: STAFF_HOME.WAITER, label: "Service board", icon: "service" },
      { href: WAITER_TABLES_HREF, label: "Tables", icon: "tables" },
      notificationsNav,
    ],
    pageTitles: {
      [STAFF_HOME.WAITER]: "Service board",
      [WAITER_TABLES_HREF]: "Tables",
      [STAFF_NOTIFICATIONS_HREF]: "Notifications",
    },
    notificationsHref: STAFF_NOTIFICATIONS_HREF,
    bellEmptyText: "Dine-in orders ready to serve and tables to clean will show up here.",
    sidebarStorageKey: "dinego-waiter-sidebar-collapsed",
  },
  CASHIER: {
    name: "Cashier",
    consoleLabel: "Pickup counter",
    workspaceLabel: "Takeaway counter",
    homeHref: STAFF_HOME.CASHIER,
    navigation: [
      { href: STAFF_HOME.CASHIER, label: "Pickup counter", icon: "counter" },
      notificationsNav,
    ],
    pageTitles: {
      [STAFF_HOME.CASHIER]: "Pickup counter",
      [STAFF_NOTIFICATIONS_HREF]: "Notifications",
    },
    notificationsHref: STAFF_NOTIFICATIONS_HREF,
    bellEmptyText: "New takeaway orders and orders ready for pickup will show up here.",
    sidebarStorageKey: "dinego-cashier-sidebar-collapsed",
  },
};

/**
 * Staff notifications about an order have no link of their own, so they open the order on the
 * role's board (the board highlights it). Stopped orders have left every board, so those only
 * inform. Waiters' table notifications open the table on the floor page.
 */
function staffLinks(role: StaffDashboardRole): (item: NotificationItem) => string | null {
  return (item) => {
    const own = notificationHref(item);
    if (own) return own;
    if (item.entityId === null) return null;
    if (item.entityType === "ORDER" && item.type !== "ORDER_STOPPED") {
      return `${STAFF_HOME[role]}?order=${item.entityId}`;
    }
    if (item.entityType === "TABLE" && role === "WAITER") {
      return `${WAITER_TABLES_HREF}?table=${item.entityId}`;
    }
    return null;
  };
}

/** Stable per role, so the notifications provider does not re-render on every render. */
const STAFF_LINKS: Record<StaffDashboardRole, (item: NotificationItem) => string | null> = {
  KITCHEN: staffLinks("KITCHEN"),
  WAITER: staffLinks("WAITER"),
  CASHIER: staffLinks("CASHIER"),
};

/** The signed-in staff member's console: their inbox, navigation, bell, and user menu. */
export function StaffConsole({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useStaff();

  return (
    <NotificationsProvider audience="staff" resolveLink={STAFF_LINKS[role]}>
      <ConsoleShell config={CONSOLES[role]} user={user} onSignOut={signOut}>
        {children}
      </ConsoleShell>
    </NotificationsProvider>
  );
}
