import type { Metadata } from "next";
import { OverviewView } from "@/components/account/overview-view";

export const metadata: Metadata = {
  title: "Your account — DineGo Kitchen",
};

export default function AccountPage() {
  return <OverviewView />;
}
