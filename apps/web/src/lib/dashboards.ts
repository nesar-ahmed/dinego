import type { MeResponse, UserRole } from "@dinego/shared";

/**
 * Staff roles with their own dashboard outside the admin console: the people who move an order
 * from placement to the guest. The kitchen cooks every order; waiters serve dine-in tables and
 * turn them over; cashiers hand takeaway orders over at the counter.
 */
export const STAFF_DASHBOARD_ROLES = ["KITCHEN", "WAITER", "CASHIER"] as const;
export type StaffDashboardRole = (typeof STAFF_DASHBOARD_ROLES)[number];

export function isStaffDashboardRole(role: UserRole): role is StaffDashboardRole {
  return (STAFF_DASHBOARD_ROLES as readonly UserRole[]).includes(role);
}

/** Each staff dashboard's home page. */
export const STAFF_HOME: Record<StaffDashboardRole, string> = {
  KITCHEN: "/staff/kitchen",
  WAITER: "/staff/waiter",
  CASHIER: "/staff/cashier",
};

/** Where an account's "Dashboard" is: the customer panel, the admin console, or a staff board. */
export function dashboardPathFor(role: UserRole): string {
  if (role === "CUSTOMER") return "/account";
  if (isStaffDashboardRole(role)) return STAFF_HOME[role];
  return "/admin";
}

export function dashboardPathForSession(session: MeResponse): string {
  return session.type === "CUSTOMER" ? "/account" : dashboardPathFor(session.user.role);
}
