import type { Metadata } from "next";
import { OrdersListView } from "@/components/orders/orders-list-view";

export const metadata: Metadata = {
  title: "Your orders — DineGo Kitchen",
};

export default function OrdersPage() {
  return <OrdersListView />;
}
