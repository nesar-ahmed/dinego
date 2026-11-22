import { z } from "zod";
import {
  dietaryTagSchema,
  itemStatusSchema,
  notificationCategorySchema,
  notificationEntityTypeSchema,
  notificationPrioritySchema,
  notificationTypeSchema,
  orderStatusSchema,
  orderTypeSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  stationSchema,
  stockMovementReasonSchema,
  tableStatusSchema,
  userRoleSchema,
} from "./enums";

/**
 * Serialized API/domain shapes for every backend entity.
 *
 * Conventions:
 * - IDs are positive integers.
 * - Money is always an integer number of cents.
 * - Dates are serialized as ISO-8601 strings.
 * - Secret fields such as password_hash and pin_hash are intentionally excluded.
 */

export const idSchema = z.number().int().positive();
export const timestampSchema = z.iso.datetime();
export const centsSchema = z.number().int().nonnegative();
/** URL-safe identifier, e.g. `small-plates` or `crispy-calamari`. */
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens");

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export const userSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.email().nullable(),
  phone: z.string().nullable(),
  role: userRoleSchema,
  active: z.boolean(),
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

export const customerSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string().nullable(),
  email: z.email().nullable(),
  createdAt: timestampSchema,
});
export type Customer = z.infer<typeof customerSchema>;

/* -------------------------------------------------------------------------- */
/* Menu                                                                        */
/* -------------------------------------------------------------------------- */

export const menuCategorySchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  /** Inactive categories and all of their items are hidden from the public menu. */
  active: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type MenuCategory = z.infer<typeof menuCategorySchema>;

export const menuItemSchema = z.object({
  id: idSchema,
  categoryId: idSchema,
  slug: slugSchema,
  name: z.string(),
  description: z.string().nullable(),
  priceCents: centsSchema,
  taxRate: z.number().min(0).max(100),
  station: stationSchema,
  allergens: z.array(z.string()),
  dietaryTags: z.array(dietaryTagSchema),
  /** Highlighted as a chef's pick on the public site. */
  featured: z.boolean(),
  /** False when the item is temporarily sold out; it stays listed but cannot be ordered. */
  available: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const modifierGroupSchema = z.object({
  id: idSchema,
  name: z.string(),
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().positive(),
});
export type ModifierGroup = z.infer<typeof modifierGroupSchema>;

export const modifierSchema = z.object({
  id: idSchema,
  groupId: idSchema,
  name: z.string(),
  priceDeltaCents: z.number().int(),
});
export type Modifier = z.infer<typeof modifierSchema>;

export const itemModifierGroupSchema = z.object({
  itemId: idSchema,
  groupId: idSchema,
});
export type ItemModifierGroup = z.infer<typeof itemModifierGroupSchema>;

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

/** One active cart per customer. Prices are not stored; the cart always uses current menu prices. */
export const cartSchema = z.object({
  id: idSchema,
  customerId: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Cart = z.infer<typeof cartSchema>;

export const cartItemSchema = z.object({
  id: idSchema,
  cartId: idSchema,
  menuItemId: idSchema,
  quantity: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type CartItem = z.infer<typeof cartItemSchema>;

/* -------------------------------------------------------------------------- */
/* Floor                                                                       */
/* -------------------------------------------------------------------------- */

export const diningTableSchema = z.object({
  id: idSchema,
  /** Short name shown on the floor plan and to customers, e.g. `T4`. Unique, case-insensitive. */
  label: z.string(),
  seats: z.number().int().positive(),
  zone: z.string().nullable(),
  status: tableStatusSchema,
  /** Inactive tables are out of service: hidden from customers and cannot change status. */
  active: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type DiningTable = z.infer<typeof diningTableSchema>;

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export const orderSchema = z.object({
  id: idSchema,
  orderNo: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
  tableId: idSchema.nullable(),
  customerId: idSchema.nullable(),
  pickupTime: timestampSchema.nullable(),
  pickupCode: z.string().nullable(),
  subtotalCents: centsSchema,
  taxCents: centsSchema,
  tipCents: centsSchema,
  totalCents: centsSchema,
  notes: z.string().nullable(),
  /** Staff member who entered the order; null for customer self-checkout. */
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Order = z.infer<typeof orderSchema>;

export const orderItemSchema = z.object({
  id: idSchema,
  orderId: idSchema,
  menuItemId: idSchema,
  /** Menu item name when ordered, so history survives menu renames. */
  name: z.string(),
  quantity: z.number().int().positive(),
  /** Menu price when paid, before tax. */
  unitPriceCents: centsSchema,
  status: itemStatusSchema,
  station: stationSchema,
  notes: z.string().nullable(),
  firedAt: timestampSchema.nullable(),
  readyAt: timestampSchema.nullable(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderItemModifierSchema = z.object({
  id: idSchema,
  orderItemId: idSchema,
  modifierId: idSchema,
  priceDeltaCents: z.number().int(),
});
export type OrderItemModifier = z.infer<typeof orderItemModifierSchema>;

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A charge. Customer checkout payments are taken BEFORE the order exists: the payment stores a
 * snapshot of the checkout (order type, table, lines, totals) and `orderId` stays null until the
 * order is created from that snapshot.
 */
export const paymentSchema = z.object({
  id: idSchema,
  orderId: idSchema.nullable(),
  customerId: idSchema.nullable(),
  orderType: orderTypeSchema,
  /** Required for DINE_IN, null for TAKEAWAY. */
  tableId: idSchema.nullable(),
  method: paymentMethodSchema,
  subtotalCents: centsSchema,
  taxCents: centsSchema,
  tipCents: centsSchema,
  /** `subtotalCents + taxCents + tipCents`. */
  amountCents: z.number().int().positive(),
  status: paymentStatusSchema,
  /** Payment provider that processed the charge, e.g. `simulated`. */
  provider: z.string(),
  providerRef: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  idempotencyKey: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Payment = z.infer<typeof paymentSchema>;

export const refundSchema = z.object({
  id: idSchema,
  paymentId: idSchema,
  amountCents: z.number().int().positive(),
  reason: z.string(),
  approvedBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type Refund = z.infer<typeof refundSchema>;

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

export const ingredientSchema = z.object({
  id: idSchema,
  name: z.string(),
  unit: z.string(),
  stockQty: z.number().nonnegative(),
  parLevel: z.number().nonnegative(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;

export const recipeSchema = z.object({
  menuItemId: idSchema,
  ingredientId: idSchema,
  qty: z.number().positive(),
});
export type Recipe = z.infer<typeof recipeSchema>;

export const stockMovementSchema = z.object({
  id: idSchema,
  ingredientId: idSchema,
  changeQty: z.number(),
  reason: stockMovementReasonSchema,
  refId: z.string().nullable(),
  createdAt: timestampSchema,
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

/* -------------------------------------------------------------------------- */
/* Staff and system                                                            */
/* -------------------------------------------------------------------------- */

export const shiftSchema = z.object({
  id: idSchema,
  userId: idSchema,
  clockIn: timestampSchema,
  clockOut: timestampSchema.nullable(),
});
export type Shift = z.infer<typeof shiftSchema>;

export const pickupSlotSchema = z.object({
  id: idSchema,
  slotStart: timestampSchema,
  capacity: z.number().int().positive(),
  used: z.number().int().nonnegative(),
});
export type PickupSlot = z.infer<typeof pickupSlotSchema>;

export const auditLogSchema = z.object({
  id: idSchema,
  userId: idSchema.nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  at: timestampSchema,
});
export type AuditLog = z.infer<typeof auditLogSchema>;

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/** A path inside the web app, e.g. `/account/orders/42`. Never another site (`//evil.example`). */
export const internalPathSchema = z
  .string()
  .max(300)
  .regex(/^\/(?!\/)/, "Must be a path inside the app, starting with a single /");

/**
 * An in-app notification for ONE user. Events that concern several people (for example a new
 * customer for every admin) create one row per recipient, so each user has their own read state.
 * Title and body are written when the event happens, so they do not change later.
 */
export const notificationSchema = z.object({
  id: idSchema,
  recipientId: idSchema,
  type: notificationTypeSchema,
  category: notificationCategorySchema,
  priority: notificationPrioritySchema,
  title: z.string(),
  body: z.string(),
  /** Where clicking the notification leads; null when there is nothing to open. */
  link: internalPathSchema.nullable(),
  entityType: notificationEntityTypeSchema.nullable(),
  entityId: idSchema.nullable(),
  /** Extra details for the client, e.g. `{ "customerId": 12 }`. */
  data: z.record(z.string(), z.unknown()).nullable(),
  /** Makes an event notify each recipient at most once, e.g. `customer:12:welcome`. */
  dedupeKey: z.string().nullable(),
  readAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type Notification = z.infer<typeof notificationSchema>;
