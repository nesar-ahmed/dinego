import { describe, expect, it } from "vitest";
import {
  canChangeOrderStatus,
  canSetOrderStatus,
  ORDER_STATUS_TRANSITIONS,
  ORDER_STATUSES,
  ORDER_TYPES,
  orderActionsFor,
  STAFF_BOARD_SCOPES,
  TABLE_STATUS_TRANSITIONS,
  TABLE_STATUSES,
  tableActionsFor,
  type OrderStatus,
  type OrderType,
  type StaffRole,
} from "@dinego/shared";
import { demoOrders } from "../database/seeds/demo-service.seed.js";
import { menuCatalog } from "../database/seeds/menu.seed.js";
import { floorPlan } from "../database/seeds/tables.seed.js";

const STAFF: StaffRole[] = ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN"];
const FINISHED: OrderStatus[] = ["CLOSED", "COLLECTED", "CANCELLED", "REJECTED", "NO_SHOW"];

describe("orderActionsFor", () => {
  it("gives each step of both flows to the kitchen, the waiter, or the cashier", () => {
    const flows: Record<OrderType, Array<[OrderStatus, OrderStatus, StaffRole[]]>> = {
      DINE_IN: [
        ["SENT", "IN_PROGRESS", ["KITCHEN"]],
        ["IN_PROGRESS", "READY", ["KITCHEN"]],
        ["READY", "SERVED", ["WAITER"]],
        ["SERVED", "CLOSED", ["WAITER", "CASHIER"]],
      ],
      TAKEAWAY: [
        ["PLACED", "ACCEPTED", ["CASHIER", "KITCHEN"]],
        ["ACCEPTED", "PREPARING", ["KITCHEN"]],
        ["PREPARING", "READY_FOR_PICKUP", ["KITCHEN"]],
        ["READY_FOR_PICKUP", "COLLECTED", ["CASHIER"]],
      ],
    };

    for (const type of ORDER_TYPES) {
      for (const [from, to, roles] of flows[type]) {
        const frontline = (["WAITER", "CASHIER", "KITCHEN"] as const).filter((role) =>
          orderActionsFor(role, type, from).includes(to),
        );
        expect(frontline, `${type} ${from} → ${to}`).toEqual(expect.arrayContaining(roles));
        expect(frontline).toHaveLength(roles.length);
        // Admins and managers can always step in.
        expect(orderActionsFor("ADMIN", type, from)).toContain(to);
        expect(orderActionsFor("MANAGER", type, from)).toContain(to);
      }
    }
  });

  it("lists the usual next step first, and nothing for customers or finished orders", () => {
    expect(orderActionsFor("KITCHEN", "DINE_IN", "SENT")).toEqual(["IN_PROGRESS", "READY"]);
    expect(orderActionsFor("KITCHEN", "TAKEAWAY", "ACCEPTED")).toEqual([
      "PREPARING",
      "READY_FOR_PICKUP",
    ]);
    expect(orderActionsFor("CASHIER", "TAKEAWAY", "READY_FOR_PICKUP")).toEqual([
      "COLLECTED",
      "NO_SHOW",
    ]);
    expect(orderActionsFor("WAITER", "DINE_IN", "SENT")).toEqual([]);
    expect(orderActionsFor("KITCHEN", "DINE_IN", "READY")).toEqual([]);
    expect(orderActionsFor("MANAGER", "TAKEAWAY", "PLACED")).toEqual([
      "ACCEPTED",
      "REJECTED",
      "CANCELLED",
    ]);
    for (const type of ORDER_TYPES) {
      for (const status of ORDER_STATUSES) {
        expect(orderActionsFor("CUSTOMER", type, status)).toEqual([]);
      }
      for (const status of FINISHED) {
        expect(orderActionsFor("ADMIN", type, status)).toEqual([]);
      }
    }
  });

  it("only offers moves the status endpoint accepts", () => {
    for (const role of STAFF) {
      for (const type of ORDER_TYPES) {
        for (const status of ORDER_STATUSES) {
          for (const next of orderActionsFor(role, type, status)) {
            expect(canChangeOrderStatus(type, status, next)).toBe(true);
            expect(canSetOrderStatus(role, next)).toBe(true);
          }
        }
      }
    }
  });
});

describe("STAFF_BOARD_SCOPES", () => {
  it("shows every order a role can act on, and no finished orders", () => {
    /** Deliberately left off a board: someone else's board covers these steps. */
    const elsewhere = new Set([
      // Staff-entered OPEN orders: no frontline screen creates them yet.
      "WAITER DINE_IN OPEN",
      // Cashiers may close a served dine-in order, but closing is the waiter's step.
      "CASHIER DINE_IN SERVED",
    ]);
    for (const role of STAFF) {
      for (const type of ORDER_TYPES) {
        const scope = STAFF_BOARD_SCOPES[role][type] ?? [];
        for (const status of ORDER_STATUSES) {
          if (orderActionsFor(role, type, status).length > 0) {
            if (elsewhere.has(`${role} ${type} ${status}`)) continue;
            expect(scope, `${role} ${type} ${status}`).toContain(status);
          }
        }
        for (const status of FINISHED) expect(scope).not.toContain(status);
      }
    }
  });

  it("keeps waiters on dine-in and cashiers on takeaway", () => {
    expect(STAFF_BOARD_SCOPES.WAITER.TAKEAWAY).toBeUndefined();
    expect(STAFF_BOARD_SCOPES.CASHIER.DINE_IN).toBeUndefined();
    expect(Object.keys(STAFF_BOARD_SCOPES.ADMIN.DINE_IN!)).not.toHaveLength(0);
    expect(STAFF_BOARD_SCOPES.ADMIN.DINE_IN).toEqual(Object.keys(ORDER_STATUS_TRANSITIONS.DINE_IN));
  });
});

describe("tableActionsFor", () => {
  it("allows the table transitions, except cleaning or freeing while guests have open orders", () => {
    for (const status of TABLE_STATUSES) {
      expect(tableActionsFor(status, true, 0)).toEqual(TABLE_STATUS_TRANSITIONS[status]);
      const busy = tableActionsFor(status, true, 2);
      expect(busy).not.toContain("CLEANING");
      expect(busy).not.toContain("FREE");
      expect(tableActionsFor(status, false, 0)).toEqual([]);
    }
    expect(tableActionsFor("OCCUPIED", true, 1)).toEqual(["BILL_REQUESTED"]);
  });
});

describe("demo service seed data", () => {
  const slugs = new Set(menuCatalog.flatMap((category) => category.items.map((item) => item.slug)));
  const labels = new Set(floorPlan.map((table) => table.label));

  it("only takes steps the flow allows, by a role allowed to take them, in time order", () => {
    for (const demo of demoOrders) {
      let status: OrderStatus = demo.type === "DINE_IN" ? "SENT" : "PLACED";
      let time = demo.placedMinutesAgo;

      for (const step of demo.steps) {
        expect(orderActionsFor(step.by, demo.type, status), `${demo.key}: ${step.to}`).toContain(
          step.to,
        );
        expect(step.minutesAgo, `${demo.key}: ${step.to} after the previous step`).toBeLessThan(
          time,
        );
        status = step.to;
        time = step.minutesAgo;
      }
    }
  });

  it("orders real menu items for real tables, one open order per table", () => {
    const openTables = new Set<string>();
    for (const demo of demoOrders) {
      for (const [slug] of demo.lines) expect(slugs, demo.key).toContain(slug);
      expect(demo.table === undefined, demo.key).toBe(demo.type === "TAKEAWAY");
      if (!demo.table) continue;
      expect(labels).toContain(demo.table);
      const open = !FINISHED.includes(demo.steps.at(-1)?.to ?? "SENT");
      if (open) {
        expect(openTables, `${demo.key}: table ${demo.table}`).not.toContain(demo.table);
        openTables.add(demo.table);
      }
    }
  });

  it("fills every column of the kitchen, service, and pickup boards", () => {
    const current = demoOrders.map((demo) => ({
      type: demo.type,
      status: demo.steps.at(-1)?.to ?? (demo.type === "DINE_IN" ? "SENT" : "PLACED"),
    }));
    const has = (type: OrderType, status: OrderStatus) =>
      current.some((order) => order.type === type && order.status === status);

    for (const status of ["SENT", "IN_PROGRESS", "READY", "SERVED"] as const) {
      expect(has("DINE_IN", status), status).toBe(true);
    }
    for (const status of ["PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"] as const) {
      expect(has("TAKEAWAY", status), status).toBe(true);
    }
  });
});
