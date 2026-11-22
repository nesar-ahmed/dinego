import type { Metadata } from "next";
import { StaffNotifications } from "@/components/staff/staff-notifications";

export const metadata: Metadata = {
  title: "Notifications — DineGo",
};

export default function StaffNotificationsPage() {
  return <StaffNotifications />;
}
