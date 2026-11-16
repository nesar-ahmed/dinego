import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export const USER_ROLES = ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN", "CUSTOMER"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = (typeof USER_ROLES)[number];

/* -------------------------------------------------------------------------- */
/* Menu                                                                        */
/* -------------------------------------------------------------------------- */

export const STATIONS = ["GRILL", "COLD", "BAR", "DESSERT", "OTHER"] as const;
export const stationSchema = z.enum(STATIONS);
export type Station = (typeof STATIONS)[number];

/* -------------------------------------------------------------------------- */
/* Floor                                                                       */
/* -------------------------------------------------------------------------- */

export const TABLE_STATUSES = [
  "FREE",
  "OCCUPIED",
  "BILL_REQUESTED",
  "CLEANING",
  "RESERVED",
] as const;
export const tableStatusSchema = z.enum(TABLE_STATUSES);
export type TableStatus = (typeof TABLE_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export const ORDER_TYPES = ["DINE_IN", "TAKEAWAY"] as const;
export const orderTypeSchema = z.enum(ORDER_TYPES);
export type OrderType = (typeof ORDER_TYPES)[number];

export const DINE_IN_ORDER_STATUSES = [
  "OPEN",
  "SENT",
  "IN_PROGRESS",
  "READY",
  "SERVED",
  "BILL_REQUESTED",
  "PAID",
  "CLOSED",
] as const;

export const TAKEAWAY_ORDER_STATUSES = [
  "PLACED",
  "PAY_AT_PICKUP",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "COLLECTED",
] as const;

export const ORDER_EXIT_STATUSES = ["CANCELLED", "REJECTED", "NO_SHOW"] as const;

export const ORDER_STATUSES = [
  ...DINE_IN_ORDER_STATUSES,
  ...TAKEAWAY_ORDER_STATUSES,
  ...ORDER_EXIT_STATUSES,
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ITEM_STATUSES = [
  "PENDING",
  "FIRED",
  "PREPARING",
  "READY",
  "SERVED",
  "VOIDED",
] as const;
export const itemStatusSchema = z.enum(ITEM_STATUSES);
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

export const PAYMENT_METHODS = ["CASH", "CARD", "ONLINE"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

export const STOCK_MOVEMENT_REASONS = ["SALE", "DELIVERY", "WASTE", "COUNT"] as const;
export const stockMovementReasonSchema = z.enum(STOCK_MOVEMENT_REASONS);
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];
