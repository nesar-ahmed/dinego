import type {
  CustomerOrder,
  CustomerOrderSummary,
  OrderPayment,
  StaffOrder,
  StaffOrderSummary,
} from "@dinego/shared";
import type { Payment } from "../payments/entities/payment.entity.js";
import type { OrderItem } from "./entities/order-item.entity.js";
import type { Order } from "./entities/order.entity.js";

/** Requires `order.table` to be loaded for dine-in orders. */
export function toOrderSummary(order: Order, itemCount: number): CustomerOrderSummary {
  return {
    id: order.id,
    orderNo: order.orderNo,
    type: order.type,
    status: order.status,
    table: order.table ? { id: order.table.id, label: order.table.label } : null,
    pickupCode: order.pickupCode,
    itemCount,
    totalCents: order.totalCents,
    createdAt: order.createdAt.toISOString(),
  };
}

function toOrderPayment(payment: Payment): OrderPayment {
  return {
    id: payment.id,
    method: payment.method,
    status: payment.status,
    amountCents: payment.amountCents,
    createdAt: payment.createdAt.toISOString(),
  };
}

/** Requires `order.items` (and `order.table` for dine-in) to be loaded. */
export function toCustomerOrder(order: Order, payments: Payment[]): CustomerOrder {
  const items = [...order.items].sort((a: OrderItem, b: OrderItem) => a.id - b.id);

  return {
    ...toOrderSummary(
      order,
      items.reduce((sum, item) => sum + item.quantity, 0),
    ),
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.unitPriceCents * item.quantity,
      status: item.status,
    })),
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    pickupTime: order.pickupTime?.toISOString() ?? null,
    notes: order.notes,
    payments: payments.map(toOrderPayment),
    statusReason: order.statusReason,
    updatedAt: order.updatedAt.toISOString(),
  };
}

/** Requires `order.table` (dine-in) and `order.customer` to be loaded. */
export function toStaffOrderSummary(order: Order, itemCount: number): StaffOrderSummary {
  return {
    ...toOrderSummary(order, itemCount),
    customer: order.customer ? { id: order.customer.id, name: order.customer.name } : null,
    statusReason: order.statusReason,
    updatedAt: order.updatedAt.toISOString(),
  };
}

/** Requires `order.items`, `order.table` (dine-in), and `order.customer` to be loaded. */
export function toStaffOrder(order: Order): StaffOrder {
  const items = [...order.items].sort((a: OrderItem, b: OrderItem) => a.id - b.id);

  return {
    ...toStaffOrderSummary(
      order,
      items.reduce((sum, item) => sum + item.quantity, 0),
    ),
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.unitPriceCents * item.quantity,
      status: item.status,
      station: item.station,
      firedAt: item.firedAt?.toISOString() ?? null,
      readyAt: item.readyAt?.toISOString() ?? null,
    })),
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    pickupTime: order.pickupTime?.toISOString() ?? null,
    notes: order.notes,
  };
}
