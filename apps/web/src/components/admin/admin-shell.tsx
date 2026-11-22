"use client";

import type { ReactNode } from "react";
import { ConsoleShell, type ConsoleConfig } from "@/components/console/console-shell";
import { useAdmin } from "./admin-provider";

const NOTIFICATIONS_HREF = "/admin/notifications";

const ADMIN_CONSOLE: ConsoleConfig = {
  name: "Admin",
  consoleLabel: "Admin console",
  workspaceLabel: "Admin workspace",
  homeHref: "/admin",
  navigation: [
    { href: "/admin", label: "Overview", icon: "grid" },
    { href: "/admin/users", label: "Staff", icon: "users" },
    { href: "/admin/customers", label: "Customers", icon: "customers" },
    { href: NOTIFICATIONS_HREF, label: "Notifications", icon: "bell" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ],
  pageTitles: {
    "/admin": "Overview",
    "/admin/users": "Staff accounts",
    "/admin/customers": "Customers",
    [NOTIFICATIONS_HREF]: "Notifications",
    "/admin/settings": "Settings",
  },
  notificationsHref: NOTIFICATIONS_HREF,
  bellEmptyText: "New orders, customer sign-ups, and floor changes will show up here.",
  sidebarStorageKey: "dinego-admin-sidebar-collapsed",
  showWebsiteLink: true,
};

export function AdminShell({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAdmin();

  return (
    <ConsoleShell config={ADMIN_CONSOLE} user={admin} onSignOut={signOut}>
      {children}
    </ConsoleShell>
  );
}
