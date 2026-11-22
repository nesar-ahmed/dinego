import { describe, expect, it } from "vitest";
import {
  canChangeOrderStatus,
  canSetOrderStatus,
  ORDER_STATUS_TRANSITIONS,
  ORDER_STATUSES,
  staffOrdersQuerySchema,
  updateOrderStatusSchema,
  type OrderStatus,
} from "@dinego/shared";

const issues = (result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}) =>
  result.success
    ? []
    : result.error!.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

describe("order status transitions", () => {
  it("walks a takeaway order from placed to collected", () => {
    const path: OrderStatus[] = [
      "PLACED",
      "ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "COLLECTED",
    ];
    for (let step = 1; step < path.length; step += 1) {
      expect(canChangeOrderStatus("TAKEAWAY", path[step - 1], path[step])).toBe(true);
    }
    // Skipping the optional PREPARING step is allowed.
    expect(canChangeOrderStatus("TAKEAWAY", "ACCEPTED", "READY_FOR_PICKUP")).toBe(true);
  });

  it("walks a dine-in order from the kitchen to closed", () => {
    const path: OrderStatus[] = ["SENT", "IN_PROGRESS", "READY", "SERVED", "CLOSED"];
    for (let step = 1; step < path.length; step += 1) {
      expect(canChangeOrderStatus("DINE_IN", path[step - 1], path[step])).toBe(true);
    }
    expect(canChangeOrderStatus("DINE_IN", "SENT", "READY")).toBe(true);
  });

  it("allows the exits only where they make sense", () => {
    expect(canChangeOrderStatus("TAKEAWAY", "PLACED", "REJECTED")).toBe(true);
    expect(canChangeOrderStatus("TAKEAWAY", "ACCEPTED", "REJECTED")).toBe(false);
    expect(canChangeOrderStatus("TAKEAWAY", "PREPARING", "CANCELLED")).toBe(true);
    expect(canChangeOrderStatus("TAKEAWAY", "READY_FOR_PICKUP", "CANCELLED")).toBe(false);
    expect(canChangeOrderStatus("TAKEAWAY", "READY_FOR_PICKUP", "NO_SHOW")).toBe(true);
    expect(canChangeOrderStatus("DINE_IN", "IN_PROGRESS", "CANCELLED")).toBe(true);
    expect(canChangeOrderStatus("DINE_IN", "READY", "CANCELLED")).toBe(false);
    expect(canChangeOrderStatus("DINE_IN", "SENT", "NO_SHOW")).toBe(false);
  });

  it("never goes backwards, mixes order types, or leaves a final status", () => {
    expect(canChangeOrderStatus("TAKEAWAY", "READY_FOR_PICKUP", "PREPARING")).toBe(false);
    expect(canChangeOrderStatus("TAKEAWAY", "PLACED", "SERVED")).toBe(false);
    expect(canChangeOrderStatus("DINE_IN", "SENT", "ACCEPTED")).toBe(false);

    for (const final of ["COLLECTED", "CLOSED", "CANCELLED", "REJECTED", "NO_SHOW"] as const) {
      for (const type of ["DINE_IN", "TAKEAWAY"] as const) {
        expect(ORDER_STATUS_TRANSITIONS[type][final]).toBeUndefined();
        for (const next of ORDER_STATUSES) {
          expect(canChangeOrderStatus(type, final, next)).toBe(next === final);
        }
      }
    }
  });

  it("treats repeating the current status as allowed (a no-op)", () => {
    expect(canChangeOrderStatus("TAKEAWAY", "ACCEPTED", "ACCEPTED")).toBe(true);
  });
});

describe("who may set a status", () => {
  it("lets each role do its own job", () => {
    expect(canSetOrderStatus("KITCHEN", "READY")).toBe(true);
    expect(canSetOrderStatus("KITCHEN", "READY_FOR_PICKUP")).toBe(true);
    expect(canSetOrderStatus("WAITER", "SERVED")).toBe(true);
    expect(canSetOrderStatus("CASHIER", "COLLECTED")).toBe(true);
    expect(canSetOrderStatus("CASHIER", "ACCEPTED")).toBe(true);

    expect(canSetOrderStatus("WAITER", "READY")).toBe(false);
    expect(canSetOrderStatus("KITCHEN", "COLLECTED")).toBe(false);
    expect(canSetOrderStatus("CUSTOMER", "ACCEPTED")).toBe(false);
  });

  it("keeps rejecting and cancelling to ADMIN and MANAGER, who can set anything", () => {
    for (const status of ["REJECTED", "CANCELLED"] as const) {
      expect(canSetOrderStatus("ADMIN", status)).toBe(true);
      expect(canSetOrderStatus("MANAGER", status)).toBe(true);
      for (const role of ["WAITER", "CASHIER", "KITCHEN"] as const) {
        expect(canSetOrderStatus(role, status)).toBe(false);
      }
    }
    for (const status of ORDER_STATUSES) {
      expect(canSetOrderStatus("MANAGER", status)).toBe(true);
    }
  });
});

describe("staff order request schemas", () => {
  it("needs a reason to reject or cancel, allows one for a no-show, and refuses it otherwise", () => {
    expect(issues(updateOrderStatusSchema.safeParse({ status: "REJECTED" }))).toEqual([
      "reason: Tell the customer why the order is rejected or cancelled",
    ]);
    expect(updateOrderStatusSchema.safeParse({ status: "CANCELLED" }).success).toBe(false);
    expect(
      updateOrderStatusSchema.parse({ status: "CANCELLED", reason: "  Kitchen fire  " }),
    ).toEqual({ status: "CANCELLED", reason: "Kitchen fire" });
    expect(updateOrderStatusSchema.parse({ status: "NO_SHOW" })).toEqual({ status: "NO_SHOW" });
    expect(
      issues(updateOrderStatusSchema.safeParse({ status: "ACCEPTED", reason: "Sure" })),
    ).toEqual(["reason: A reason is only for REJECTED, CANCELLED, or NO_SHOW"]);
    expect(updateOrderStatusSchema.safeParse({ status: "REJECTED", reason: "no" }).success).toBe(
      false,
    );
    expect(updateOrderStatusSchema.safeParse({ status: "DONE" }).success).toBe(false);
    expect(updateOrderStatusSchema.safeParse({ status: "ACCEPTED", extra: 1 }).success).toBe(false);
  });

  it("filters the staff list by several statuses and a type", () => {
    expect(staffOrdersQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(
      staffOrdersQuerySchema.parse({ status: "PLACED,ACCEPTED", type: "TAKEAWAY", pageSize: "5" }),
    ).toEqual({ page: 1, pageSize: 5, status: ["PLACED", "ACCEPTED"], type: "TAKEAWAY" });
    expect(staffOrdersQuerySchema.safeParse({ status: "PLACED,LOST" }).success).toBe(false);
    expect(staffOrdersQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});
