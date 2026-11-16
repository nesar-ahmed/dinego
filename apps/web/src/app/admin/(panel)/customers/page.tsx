import type { Metadata } from "next";
import { AdminCustomers } from "@/components/admin/admin-customers";

export const metadata: Metadata = {
  title: "Customers — DineGo Admin",
};

export default function AdminCustomersPage() {
  return <AdminCustomers />;
}
