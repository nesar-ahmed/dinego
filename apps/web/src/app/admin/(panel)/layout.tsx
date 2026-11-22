import type { ReactNode } from "react";
import { AdminProvider } from "@/components/admin/admin-provider";
import { AdminShell } from "@/components/admin/admin-shell";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  return (
    <AdminProvider>
      <NotificationsProvider audience="staff">
        <AdminShell>{children}</AdminShell>
      </NotificationsProvider>
    </AdminProvider>
  );
}
