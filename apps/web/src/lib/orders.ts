import {
  orderResponseSchema,
  ordersResponseSchema,
  type CustomerOrder,
  type ItemStatus,
  type OrderStatus,
  type OrdersResponse,
  type OrderType,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";

/* ------------------------------- API calls ------------------------------- */

export async function fetchOrders(
  page = 1,
  pageSize = 10,
  signal?: AbortSignal,
): Promise<OrdersResponse> {
  const parsed = ordersResponseSchema.safeParse(
    await apiRequest<unknown>(`/orders?page=${page}&pageSize=${pageSize}`, { signal }),
  );

  if (!parsed.success) {
    throw new ApiError("The orders response did not match the shared contract.", 0);
  }

  return parsed.data;
}

export async function fetchOrder(id: number, signal?: AbortSignal): Promise<CustomerOrder> {
  const parsed = orderResponseSchema.safeParse(
    await apiRequest<unknown>(`/orders/${id}`, { signal }),
  );

  if (!parsed.success) {
    throw new ApiError("The order response did not match the shared contract.", 0);
  }

  return parsed.data.order;
}

/* ------------------------------- Presentation ------------------------------ */

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: "Dine in",
  TAKEAWAY: "Takeaway",
};

/** Customer-facing wording for every order status. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN: "Open",
  SENT: "Sent to the kitchen",
  IN_PROGRESS: "Being prepared",
  READY: "Ready to serve",
  SERVED: "Served",
  BILL_REQUESTED: "Bill requested",
  PAID: "Paid",
  CLOSED: "Completed",
  PLACED: "Order placed",
  PAY_AT_PICKUP: "Pay at pickup",
  ACCEPTED: "Accepted",
  PREPARING: "Being prepared",
  READY_FOR_PICKUP: "Ready for pickup",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
  REJECTED: "Declined by the restaurant",
  NO_SHOW: "Not collected",
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  PENDING: "Waiting",
  FIRED: "In the kitchen",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  VOIDED: "Removed",
};

const EXIT_STATUSES: OrderStatus[] = ["CANCELLED", "REJECTED", "NO_SHOW"];
const DONE_STATUSES: OrderStatus[] = ["SERVED", "BILL_REQUESTED", "PAID", "CLOSED", "COLLECTED"];

export type StatusTone = "active" | "done" | "stopped";

export function statusTone(status: OrderStatus): StatusTone {
  if (EXIT_STATUSES.includes(status)) return "stopped";
  if (DONE_STATUSES.includes(status)) return "done";
  return "active";
}

/** The progress steps a customer sees, per order type. */
export const ORDER_PROGRESS: Record<
  OrderType,
  Array<{ label: string; statuses: OrderStatus[] }>
> = {
  DINE_IN: [
    { label: "Sent to the kitchen", statuses: ["OPEN", "SENT"] },
    { label: "Being prepared", statuses: ["IN_PROGRESS"] },
    { label: "Ready", statuses: ["READY"] },
    { label: "Served", statuses: ["SERVED", "BILL_REQUESTED", "PAID", "CLOSED"] },
  ],
  TAKEAWAY: [
    { label: "Placed", statuses: ["PLACED", "PAY_AT_PICKUP"] },
    { label: "Accepted", statuses: ["ACCEPTED"] },
    { label: "Being prepared", statuses: ["PREPARING"] },
    { label: "Ready for pickup", statuses: ["READY_FOR_PICKUP"] },
    { label: "Collected", statuses: ["COLLECTED"] },
  ],
};

/** Index of the current progress step, or -1 for cancelled/rejected orders. */
export function progressIndex(type: OrderType, status: OrderStatus): number {
  return ORDER_PROGRESS[type].findIndex((step) => step.statuses.includes(status));
}

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatOrderDate(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
