import type { Metadata } from "next";
import { ProfileView } from "@/components/account/profile-view";

export const metadata: Metadata = {
  title: "Profile — DineGo Kitchen",
};

export default function ProfilePage() {
  return <ProfileView />;
}
