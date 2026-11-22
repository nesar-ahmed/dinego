import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetailView } from "@/components/orders/order-detail-view";

export const metadata: Metadata = {
  title: "Order — DineGo Kitchen",
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  if (!/^\d+$/.test(id) || Number(id) < 1) {
    notFound();
  }

  // `?placed=1` comes from checkout and shows the thank-you state.
  return <OrderDetailView orderId={Number(id)} placed={query.placed === "1"} />;
}
