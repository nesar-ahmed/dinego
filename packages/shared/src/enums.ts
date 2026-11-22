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

/** Customer-facing dietary labels shown on the public menu and used for filtering. */
export const DIETARY_TAGS = ["VEGETARIAN", "VEGAN", "GLUTEN_FREE", "SPICY"] as const;
export const dietaryTagSchema = z.enum(DIETARY_TAGS);
export type DietaryTag = (typeof DIETARY_TAGS)[number];

/** Sort orders supported by the public menu endpoints. `recommended` is the curated order. */
export const MENU_SORTS = [
  "recommended",
  "price_asc",
  "price_desc",
  "name_asc",
  "name_desc",
] as const;
export const menuSortSchema = z.enum(MENU_SORTS);
export type MenuSort = (typeof MENU_SORTS)[number];

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
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What a notification is about. Each type has one category, one priority, and one set of
 * recipients (see the API's notification catalog). New features add their types here.
 */
export const NOTIFICATION_TYPES = [
  /** To the new customer, after registration. */
  "CUSTOMER_WELCOME",
  /** To ADMIN and MANAGER staff, when a customer registers. */
  "CUSTOMER_REGISTERED",
  /** To the account owner, after the sign-in email changes. */
  "EMAIL_CHANGED",
  /** To the account owner, after the password changes (other sessions are signed out). */
  "PASSWORD_CHANGED",
  /** To the customer, when their paid checkout becomes an order (with the pickup code or table). */
  "ORDER_PLACED",
  /**
   * To staff, when a customer order arrives. Dine-in: ADMIN, MANAGER, WAITER, KITCHEN.
   * Takeaway: ADMIN, MANAGER, CASHIER, KITCHEN.
   */
  "ORDER_RECEIVED",
  /** To the customer, when a restart interrupted their checkout before the charge finished. */
  "CHECKOUT_INTERRUPTED",
  /** To ADMIN and MANAGER staff, at most once an hour, while the payment provider is failing. */
  "PAYMENT_PROVIDER_OUTAGE",
  /** To the customer, when staff accept their takeaway order. */
  "ORDER_ACCEPTED",
  /** To the customer: dine-in food is on its way, or takeaway is ready for pickup. */
  "ORDER_READY",
  /** To the customer, when the takeaway order is collected or the dine-in order is closed. */
  "ORDER_COMPLETED",
  /** To the customer, when the order is rejected, cancelled, or not collected (with the reason). */
  "ORDER_CANCELLED",
  /** To staff who hand the order over: WAITER for dine-in, CASHIER for takeaway. */
  "ORDER_READY_FOR_SERVICE",
  /**
   * To staff when an order is rejected or cancelled (stop preparing it): ADMIN, MANAGER, KITCHEN,
   * and WAITER or CASHIER. For a no-show: ADMIN and MANAGER.
   */
  "ORDER_STOPPED",
  /** To ADMIN and MANAGER, once, when a takeaway order waits too long to be accepted. */
  "ORDER_ACCEPTANCE_OVERDUE",
  /** To CASHIER and WAITER staff, when a table asks for the bill. */
  "TABLE_BILL_REQUESTED",
  /** To WAITER staff, when a table is marked for cleaning. */
  "TABLE_NEEDS_CLEANING",
  /** To ADMIN and MANAGER: a table was added, removed, or taken in or out of service. */
  "TABLE_LAYOUT_CHANGED",
] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Groups notifications for filtering and icons. */
export const NOTIFICATION_CATEGORIES = ["ACCOUNT", "ORDER", "PAYMENT", "FLOOR", "SYSTEM"] as const;
export const notificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** HIGH is for things the user should see now (security changes, an order that is ready). */
export const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const notificationPrioritySchema = z.enum(NOTIFICATION_PRIORITIES);
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/** The record a notification is about, e.g. `USER` 12 or `ORDER` 42. */
export const NOTIFICATION_ENTITY_TYPES = ["USER", "ORDER", "PAYMENT", "TABLE"] as const;
export const notificationEntityTypeSchema = z.enum(NOTIFICATION_ENTITY_TYPES);
export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

export const STOCK_MOVEMENT_REASONS = ["SALE", "DELIVERY", "WASTE", "COUNT"] as const;
export const stockMovementReasonSchema = z.enum(STOCK_MOVEMENT_REASONS);
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];
