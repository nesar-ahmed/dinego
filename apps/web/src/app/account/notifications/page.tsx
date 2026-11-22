import type { Metadata } from "next";
import { NotificationsView } from "@/components/account/notifications-view";

export const metadata: Metadata = {
  title: "Your notifications — DineGo Kitchen",
};

export default function NotificationsPage() {
  return <NotificationsView />;
}
