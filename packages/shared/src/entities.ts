import { z } from "zod";
import {
  itemStatusSchema,
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
  name: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: timestampSchema,
});
export type MenuCategory = z.infer<typeof menuCategorySchema>;

export const menuItemSchema = z.object({
  id: idSchema,
  categoryId: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  priceCents: centsSchema,
  taxRate: z.number().min(0).max(100),
  station: stationSchema,
  allergens: z.array(z.string()),
  available: z.boolean(),
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
/* Floor                                                                       */
/* -------------------------------------------------------------------------- */

export const diningTableSchema = z.object({
  id: idSchema,
  label: z.string(),
  seats: z.number().int().positive(),
  zone: z.string().nullable(),
  status: tableStatusSchema,
  createdAt: timestampSchema,
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
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type Order = z.infer<typeof orderSchema>;

export const orderItemSchema = z.object({
  id: idSchema,
  orderId: idSchema,
  menuItemId: idSchema,
  qty: z.number().int().positive(),
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

export const paymentSchema = z.object({
  id: idSchema,
  orderId: idSchema,
  method: paymentMethodSchema,
  amountCents: z.number().int().positive(),
  status: paymentStatusSchema,
  providerRef: z.string().nullable(),
  idempotencyKey: z.string(),
  createdAt: timestampSchema,
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
