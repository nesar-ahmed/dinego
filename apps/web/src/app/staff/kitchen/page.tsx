import type { Metadata } from "next";
import { Suspense } from "react";
import { KitchenBoard } from "@/components/staff/kitchen-board";

export const metadata: Metadata = {
  title: "Kitchen board — DineGo",
};

export default function Page() {
  // The board reads ?order= (or ?table=) from notifications, which needs a Suspense boundary.
  return (
    <Suspense>
      <KitchenBoard />
    </Suspense>
  );
}
