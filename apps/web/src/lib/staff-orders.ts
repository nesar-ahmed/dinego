import {
  staffBoardResponseSchema,
  staffOrderResponseSchema,
  type OrderStatus,
  type Station,
  type StaffBoardResponse,
  type StaffOrder,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";

/* ------------------------------- API calls ------------------------------- */

function contractError(label: string): ApiError {
  return new ApiError(`The ${label} response did not match the shared contract.`, 0);
}

/**
 * `GET /staff/board`: the signed-in staff member's board in one request. The server decides
 * which orders the role sees and what it may do with each (`actions`).
 */
export async function fetchStaffBoard(signal?: AbortSignal): Promise<StaffBoardResponse> {
  const parsed = staffBoardResponseSchema.safeParse(
    await apiRequest<unknown>("/staff/board", { signal }),
  );
  if (!parsed.success) throw contractError("staff board");
  return parsed.data;
}

/** `PATCH /staff/orders/:id/status`. Repeating the current status is a no-op on the server. */
export async function updateOrderStatus(
  id: number,
  status: OrderStatus,
  reason?: string,
): Promise<StaffOrder> {
  const parsed = staffOrderResponseSchema.safeParse(
    await apiRequest<unknown>(`/staff/orders/${id}/status`, {
      method: "PATCH",
      body: reason === undefined ? { status } : { status, reason },
    }),
  );
  if (!parsed.success) throw contractError("staff order");
  return parsed.data.order;
}

/** A status change that failed, in words for the person at the board. */
export function orderActionError(error: unknown, orderNo: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.code === "INVALID_STATUS_TRANSITION") {
      return `${orderNo} was already updated by someone else. The board has been refreshed.`;
    }
    if (error.code === "ORDER_NOT_FOUND") return `${orderNo} no longer exists.`;
    if (error.code === "STATUS_NOT_ALLOWED_FOR_ROLE") {
      return `Your role can't make that change to ${orderNo}. Ask a manager.`;
    }
    if (error.code === "VALIDATION_ERROR" && error.details[0]) return error.details[0].message;
  }
  return `We couldn't update ${orderNo}. Please try again.`;
}

/* ------------------------------- Presentation ------------------------------ */

/** The button for moving an order to each status (the board shows the order's `actions`). */
export const ORDER_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "Accept order",
  IN_PROGRESS: "Start cooking",
  PREPARING: "Start cooking",
  READY: "Ready to serve",
  READY_FOR_PICKUP: "Ready for pickup",
  SERVED: "Mark served",
  CLOSED: "Close order",
  COLLECTED: "Hand over",
  NO_SHOW: "No-show",
};

/** Staff wording: what the order is waiting for, not what the customer sees. */
export const STAFF_STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  SENT: "New",
  IN_PROGRESS: "Cooking",
  READY: "Ready to serve",
  SERVED: "Served",
  PLACED: "Awaiting acceptance",
  PAY_AT_PICKUP: "Awaiting acceptance",
  ACCEPTED: "Accepted",
  PREPARING: "Cooking",
  READY_FOR_PICKUP: "Ready for pickup",
};

export const STATION_LABELS: Record<Station, string> = {
  GRILL: "Grill",
  COLD: "Cold",
  BAR: "Bar",
  DESSERT: "Dessert",
  OTHER: "Other",
};

/** Whole minutes since `iso`, never negative (clocks can differ slightly). */
export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

/** "Just now", "4 min", "1 h 12 min". */
export function formatWait(minutes: number): string {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
