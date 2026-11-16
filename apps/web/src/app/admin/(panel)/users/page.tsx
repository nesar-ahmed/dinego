import type { Metadata } from "next";
import { AdminUsers } from "@/components/admin/admin-users";

export const metadata: Metadata = {
  title: "Staff accounts — DineGo Admin",
};

export default function AdminUsersPage() {
  return <AdminUsers />;
}
