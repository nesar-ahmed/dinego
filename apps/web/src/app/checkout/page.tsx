import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Checkout — DineGo Kitchen",
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
