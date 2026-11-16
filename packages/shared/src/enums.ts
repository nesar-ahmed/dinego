import { z } from "zod";

/**
 * A single users table backs both staff and customers.
 * Staff roles control admin/POS access; CUSTOMER marks public accounts.
 */
export const USER_ROLES = ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN", "CUSTOMER"] as const;

export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = (typeof USER_ROLES)[number];
