import type { ReactNode } from "react";
import { StaffConsole } from "@/components/staff/staff-console";
import { StaffProvider } from "@/components/staff/staff-provider";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <StaffProvider>
      <StaffConsole>{children}</StaffConsole>
    </StaffProvider>
  );
}
