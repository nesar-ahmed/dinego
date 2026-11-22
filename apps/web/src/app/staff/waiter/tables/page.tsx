import type { Metadata } from "next";
import { Suspense } from "react";
import { WaiterTables } from "@/components/staff/waiter-tables";

export const metadata: Metadata = {
  title: "Tables — DineGo",
};

export default function Page() {
  // The board reads ?order= (or ?table=) from notifications, which needs a Suspense boundary.
  return (
    <Suspense>
      <WaiterTables />
    </Suspense>
  );
}
