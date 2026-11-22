import type { Metadata } from "next";
import { AdminNotifications } from "@/components/admin/admin-notifications";

export const metadata: Metadata = {
  title: "Notifications — DineGo Admin",
};

export default function AdminNotificationsPage() {
  return <AdminNotifications />;
}
