import type { Metadata } from "next";
import { Suspense } from "react";
import { CashierBoard } from "@/components/staff/cashier-board";

export const metadata: Metadata = {
  title: "Pickup counter — DineGo",
};

export default function Page() {
  // The board reads ?order= (or ?table=) from notifications, which needs a Suspense boundary.
  return (
    <Suspense>
      <CashierBoard />
    </Suspense>
  );
}
