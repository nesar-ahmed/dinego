import type { Metadata } from "next";
import { Suspense } from "react";
import { WaiterBoard } from "@/components/staff/waiter-board";

export const metadata: Metadata = {
  title: "Service board — DineGo",
};

export default function Page() {
  // The board reads ?order= (or ?table=) from notifications, which needs a Suspense boundary.
  return (
    <Suspense>
      <WaiterBoard />
    </Suspense>
  );
}
