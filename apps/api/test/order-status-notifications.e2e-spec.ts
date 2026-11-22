import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  checkoutQuoteResponseSchema,
  notificationsResponseSchema,
  orderResponseSchema,
  staffOrderResponseSchema,
  staffOrdersResponseSchema,
  type NotificationItem,
  type UserRole,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedMenu } from "../src/database/seeds/menu.seed.js";
import { seedTables } from "../src/database/seeds/tables.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { MenuItem } from "../src/menu/entities/menu-item.entity.js";
import { OrderEscalation } from "../src/orders/order-escalation.js";
import { DiningTable } from "../src/tables/entities/dining-table.entity.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

type StaffRole = Exclude<UserRole, "CUSTOMER">;
const STAFF_ROLES: StaffRole[] = ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN"];
const account = (role: UserRole) => userAccounts.find((entry) => entry.role === role)!;

describe("Staff orders and order status notifications (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const items: Record<string, number> = {};
  const tables: Record<string, number> = {};
  const staff = {} as Record<StaffRole, string>;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  let counter = 0;
  /** A fresh customer who checks out 2 smash burgers and a lemonade ($29.30). */
  const placeOrder = async (body: object) => {
    counter += 1;
    const registered = await request(server())
      .post("/api/v1/users/register")
      .send({
        name: `Status Customer ${counter}`,
        email: `status-${counter}-${Date.now()}@dinego.com`,
        password: "Password123!",
      })
      .expect(201);
    const token = registered.body.accessToken as string;
    for (const [slug, quantity] of Object.entries({ "smash-burger": 2, "house-lemonade": 1 })) {
      await request(server())
        .post("/api/v1/cart/items")
        .set(bearer(token))
        .send({ menuItemId: items[slug], quantity })
        .expect(200);
    }
    const { totalCents } = checkoutQuoteResponseSchema.parse(
      (await request(server()).get("/api/v1/payments/quote").set(bearer(token)).expect(200)).body,
    ).quote;
    const { order } = orderResponseSchema.parse(
      (
        await request(server())
          .post("/api/v1/orders")
          .set(bearer(token))
          .set("Idempotency-Key", randomUUID())
          .send({
            method: "CARD",
            paymentToken: "tok_visa",
            expectedTotalCents: totalCents,
            ...body,
          })
          .expect(201)
      ).body,
    );
    return { token, customerId: registered.body.customer.id as number, order };
  };
  const takeaway = () => placeOrder({ orderType: "TAKEAWAY" });
  const dineIn = (label: string) => placeOrder({ orderType: "DINE_IN", tableId: tables[label] });

  const setStatus = (role: StaffRole, orderId: number, body: object) =>
    request(server())
      .patch(`/api/v1/staff/orders/${orderId}/status`)
      .set(bearer(staff[role]))
      .send(body);
  const move = async (role: StaffRole, orderId: number, status: string, reason?: string) =>
    staffOrderResponseSchema.parse(
      (await setStatus(role, orderId, reason ? { status, reason } : { status }).expect(200)).body,
    ).order;

  const inbox = async (token: string) =>
    notificationsResponseSchema.parse(
      (
        await request(server())
          .get("/api/v1/notifications?pageSize=50")
          .set(bearer(token))
          .expect(200)
      ).body,
    ).notifications;
  const about = (notifications: NotificationItem[], type: string, entityId: number) =>
    notifications.filter((item) => item.type === type && item.entityId === entityId);
  /** Which staff roles have a notification of this type about this record. */
  const staffWith = async (type: string, entityId: number) => {
    const roles: StaffRole[] = [];
    for (const role of STAFF_ROLES) {
      if (about(await inbox(staff[role]), type, entityId).length > 0) roles.push(role);
    }
    return roles;
  };
  const customerTypes = async (token: string, orderId: number) =>
    (await inbox(token))
      .filter((item) => item.entityType === "ORDER" && item.entityId === orderId)
      .map((item) => item.type)
      .reverse();

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-order-status-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");

    dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
      await seedMenu(manager);
      await seedTables(manager);
    });
    for (const item of await dataSource.getRepository(MenuItem).find()) items[item.slug] = item.id;
    for (const table of await dataSource.getRepository(DiningTable).find())
      tables[table.label] = table.id;

    ({ app, logs } = await createE2eApp());

    for (const role of STAFF_ROLES) {
      const { email, password } = account(role);
      staff[role] = (
        await request(server()).post("/api/v1/users/session-login").send({ email, password })
      ).body.accessToken as string;
    }
  });

  afterEach(() => {
    logs.assertNoUnexpectedErrors();
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    rmSync(databaseDir, { recursive: true, force: true });

    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
  });

  describe("staff order API", () => {
    it("is for staff: every staff role can read, customers cannot", async () => {
      const { token, order } = await takeaway();

      await request(server()).get("/api/v1/staff/orders").expect(401);
      await request(server()).get("/api/v1/staff/orders").set(bearer(token)).expect(403);
      await request(server())
        .patch(`/api/v1/staff/orders/${order.id}/status`)
        .set(bearer(token))
        .send({ status: "ACCEPTED" })
        .expect(403);

      for (const role of STAFF_ROLES) {
        await request(server()).get("/api/v1/staff/orders").set(bearer(staff[role])).expect(200);
      }
    });

    it("lists orders newest first, filtered by status and type, with details for the kitchen", async () => {
      const first = await takeaway();
      const second = await dineIn("T5");

      const placed = staffOrdersResponseSchema.parse(
        (
          await request(server())
            .get("/api/v1/staff/orders?status=PLACED&type=TAKEAWAY")
            .set(bearer(staff.KITCHEN))
            .expect(200)
        ).body,
      );
      expect(placed.orders.map((order) => order.id)).toContain(first.order.id);
      expect(
        placed.orders.every((order) => order.status === "PLACED" && order.type === "TAKEAWAY"),
      ).toBe(true);

      const both = staffOrdersResponseSchema.parse(
        (
          await request(server())
            .get("/api/v1/staff/orders?status=PLACED,SENT&pageSize=2")
            .set(bearer(staff.WAITER))
            .expect(200)
        ).body,
      );
      expect(both.orders.map((order) => order.id)).toEqual([second.order.id, first.order.id]);
      expect(both.orders[0]).toMatchObject({
        customer: { id: second.customerId, name: expect.stringMatching(/^Status Customer/) },
        table: { label: "T5" },
        statusReason: null,
      });

      const { order } = staffOrderResponseSchema.parse(
        (
          await request(server())
            .get(`/api/v1/staff/orders/${second.order.id}`)
            .set(bearer(staff.KITCHEN))
            .expect(200)
        ).body,
      );
      expect(order.items.map((item) => [item.name, item.station, item.status])).toEqual([
        ["Smash burger", "GRILL", "FIRED"],
        ["House lemonade", "BAR", "FIRED"],
      ]);
      expect(order.items[0].firedAt).not.toBeNull();

      await request(server())
        .get("/api/v1/staff/orders/999999")
        .set(bearer(staff.ADMIN))
        .expect(404);
    });
  });

  describe("takeaway lifecycle", () => {
    it("tells the customer when accepted, ready, and collected, and the cashier when ready", async () => {
      const { token, order } = await takeaway();

      const accepted = await move("CASHIER", order.id, "ACCEPTED");
      expect(accepted.items.every((item) => item.status === "FIRED")).toBe(true);
      await move("KITCHEN", order.id, "PREPARING");
      const ready = await move("KITCHEN", order.id, "READY_FOR_PICKUP");
      expect(ready.items.every((item) => item.status === "READY" && item.readyAt !== null)).toBe(
        true,
      );

      const [readyNotice] = about(await inbox(token), "ORDER_READY", order.id);
      expect(readyNotice).toMatchObject({
        priority: "HIGH",
        title: `Order ${order.orderNo} is ready for pickup`,
        body: `Show pickup code ${order.pickupCode} at the counter to collect it.`,
        link: `/account/orders/${order.id}`,
      });
      expect(await staffWith("ORDER_READY_FOR_SERVICE", order.id)).toEqual(["CASHIER"]);

      const collected = await move("CASHIER", order.id, "COLLECTED");
      expect(collected.items.every((item) => item.status === "SERVED")).toBe(true);

      // Placed, accepted, ready, collected: PREPARING stays on the tracker only.
      expect(await customerTypes(token, order.id)).toEqual([
        "ORDER_PLACED",
        "ORDER_ACCEPTED",
        "ORDER_READY",
        "ORDER_COMPLETED",
      ]);

      // The customer's own order page follows along.
      const mine = orderResponseSchema.parse(
        (await request(server()).get(`/api/v1/orders/${order.id}`).set(bearer(token)).expect(200))
          .body,
      ).order;
      expect(mine.status).toBe("COLLECTED");
      expect(mine.items.every((item) => item.status === "SERVED")).toBe(true);
    });

    it("declines with a reason, voids the items, and stops the staff, but not the manager who did it", async () => {
      const { token, order } = await takeaway();

      const rejected = await move("MANAGER", order.id, "REJECTED", "We ran out of burger buns");
      expect(rejected).toMatchObject({
        status: "REJECTED",
        statusReason: "We ran out of burger buns",
      });
      expect(rejected.items.every((item) => item.status === "VOIDED")).toBe(true);

      const [declined] = about(await inbox(token), "ORDER_CANCELLED", order.id);
      expect(declined).toMatchObject({
        priority: "HIGH",
        title: `Order ${order.orderNo} was declined`,
        body: "The restaurant couldn't take your order. Reason: We ran out of burger buns. Refunds are handled by the restaurant: please contact us about your payment of $29.30.",
      });
      expect(await staffWith("ORDER_STOPPED", order.id)).toEqual(["ADMIN", "CASHIER", "KITCHEN"]);

      // The customer's own order shows the reason, and its updates can be listed on their own.
      const mine = orderResponseSchema.parse(
        (await request(server()).get(`/api/v1/orders/${order.id}`).set(bearer(token)).expect(200))
          .body,
      ).order;
      expect(mine).toMatchObject({ status: "REJECTED", statusReason: "We ran out of burger buns" });
      const updates = notificationsResponseSchema.parse(
        (
          await request(server())
            .get(`/api/v1/notifications?entityType=ORDER&entityId=${order.id}`)
            .set(bearer(token))
            .expect(200)
        ).body,
      ).notifications;
      expect(updates.map((item) => item.type)).toEqual(["ORDER_CANCELLED", "ORDER_PLACED"]);
    });

    it("marks an uncollected order as a no-show and tells the customer and the managers", async () => {
      const { token, order } = await takeaway();
      await move("KITCHEN", order.id, "ACCEPTED");
      await move("KITCHEN", order.id, "READY_FOR_PICKUP");

      const noShow = await move("CASHIER", order.id, "NO_SHOW");
      expect(noShow.statusReason).toBeNull();
      // Ready food stays READY: it was made.
      expect(noShow.items.every((item) => item.status === "READY")).toBe(true);

      expect(about(await inbox(token), "ORDER_CANCELLED", order.id)[0].title).toBe(
        `Order ${order.orderNo} was not collected`,
      );
      expect(await staffWith("ORDER_STOPPED", order.id)).toEqual(["ADMIN", "MANAGER"]);
    });
  });

  describe("dine-in lifecycle", () => {
    it("tells the diner when the food is coming and the waiter when to serve it", async () => {
      const { token, order } = await dineIn("T2");

      await move("KITCHEN", order.id, "IN_PROGRESS");
      await move("KITCHEN", order.id, "READY");

      const [ready] = about(await inbox(token), "ORDER_READY", order.id);
      expect(ready).toMatchObject({
        title: `Order ${order.orderNo} is ready`,
        body: "It's on its way to table T2. Enjoy your meal!",
      });
      const [forWaiter] = about(await inbox(staff.WAITER), "ORDER_READY_FOR_SERVICE", order.id);
      expect(forWaiter).toMatchObject({
        title: `Order ${order.orderNo} is ready for table T2`,
        body: "3 items · $29.30. Serve it now.",
      });
      expect(await staffWith("ORDER_READY_FOR_SERVICE", order.id)).toEqual(["WAITER"]);

      await move("WAITER", order.id, "SERVED");
      await move("WAITER", order.id, "CLOSED");

      expect(await customerTypes(token, order.id)).toEqual([
        "ORDER_PLACED",
        "ORDER_READY",
        "ORDER_COMPLETED",
      ]);
    });

    it("cancels with a reason and tells the kitchen and the waiter to stop", async () => {
      const { token, order } = await dineIn("T6");

      await move("ADMIN", order.id, "CANCELLED", "The guests had to leave");

      expect(about(await inbox(token), "ORDER_CANCELLED", order.id)[0].title).toBe(
        `Order ${order.orderNo} was cancelled`,
      );
      const [stop] = about(await inbox(staff.KITCHEN), "ORDER_STOPPED", order.id);
      expect(stop.body).toBe(
        "Table T6 · 3 items · $29.30. Reason: The guests had to leave. Stop preparing it.",
      );
      expect(await staffWith("ORDER_STOPPED", order.id)).toEqual(["MANAGER", "WAITER", "KITCHEN"]);
    });
  });

  describe("rules", () => {
    it("lets each role set only its own statuses", async () => {
      const { order } = await takeaway();

      for (const [role, status] of [
        ["WAITER", "ACCEPTED"],
        ["KITCHEN", "CANCELLED"],
        ["CASHIER", "REJECTED"],
      ] as const) {
        const refused = await setStatus(
          role,
          order.id,
          status === "ACCEPTED" ? { status } : { status, reason: "Not my call" },
        ).expect(403);
        expect(apiErrorSchema.parse(refused.body)).toMatchObject({
          code: "STATUS_NOT_ALLOWED_FOR_ROLE",
          message: `A ${role} account cannot set an order to ${status}`,
        });
      }
    });

    it("refuses moves the order cannot make, and changes nothing", async () => {
      const { token, order } = await takeaway();

      for (const status of ["SERVED", "COLLECTED", "READY"]) {
        const refused = await setStatus("MANAGER", order.id, { status }).expect(409);
        expect(refused.body).toMatchObject({
          code: "INVALID_STATUS_TRANSITION",
          message: `Order ${order.orderNo} is PLACED; it cannot change to ${status}`,
        });
      }
      await move("MANAGER", order.id, "REJECTED", "Closing early tonight");
      await setStatus("MANAGER", order.id, { status: "ACCEPTED" }).expect(409);

      expect(await customerTypes(token, order.id)).toEqual(["ORDER_PLACED", "ORDER_CANCELLED"]);
      await setStatus("MANAGER", 999999, { status: "ACCEPTED" }).expect(404);
    });

    it("treats a repeated status as a no-op that notifies nobody again", async () => {
      const { token, order } = await takeaway();

      await move("CASHIER", order.id, "ACCEPTED");
      const again = await move("KITCHEN", order.id, "ACCEPTED");
      expect(again.status).toBe("ACCEPTED");

      expect(await customerTypes(token, order.id)).toEqual(["ORDER_PLACED", "ORDER_ACCEPTED"]);
    });

    it("lets exactly one of two simultaneous changes win, and notifies about that one", async () => {
      const { token, order } = await takeaway();

      const responses = await Promise.all([
        setStatus("CASHIER", order.id, { status: "ACCEPTED" }),
        setStatus("MANAGER", order.id, { status: "REJECTED", reason: "Kitchen is closed" }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

      const winner = responses.find((response) => response.status === 200)!.body.order.status;
      expect(await customerTypes(token, order.id)).toEqual([
        "ORDER_PLACED",
        winner === "ACCEPTED" ? "ORDER_ACCEPTED" : "ORDER_CANCELLED",
      ]);
    });

    it("validates the request", async () => {
      const { order } = await takeaway();

      for (const body of [
        { status: "REJECTED" },
        { status: "ACCEPTED", reason: "Because" },
        { status: "REJECTED", reason: "x" },
        { status: "LOST" },
        { status: "ACCEPTED", extra: true },
      ]) {
        const response = await setStatus("MANAGER", order.id, body).expect(400);
        expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
      }
      await request(server())
        .patch("/api/v1/staff/orders/abc/status")
        .set(bearer(staff.MANAGER))
        .send({ status: "ACCEPTED" })
        .expect(400);
      await request(server())
        .get("/api/v1/staff/orders?status=LOST")
        .set(bearer(staff.MANAGER))
        .expect(400);
    });

    it("never blocks a status change when notifications cannot be written", async () => {
      const { token, order } = await takeaway();
      await dataSource.query(
        `CREATE TRIGGER "test_block_notifications" BEFORE INSERT ON "notifications"
         BEGIN SELECT RAISE(ABORT, 'notifications are broken'); END`,
      );

      try {
        expect((await move("CASHIER", order.id, "ACCEPTED")).status).toBe("ACCEPTED");
        logs.expectError(
          /Could not create ORDER_ACCEPTED notification\(s\); the triggering change was kept/,
        );
      } finally {
        await dataSource.query(`DROP TRIGGER "test_block_notifications"`);
      }
      expect(await customerTypes(token, order.id)).toEqual(["ORDER_PLACED"]);
    });
  });

  describe("acceptance escalation", () => {
    it("alerts ADMIN and MANAGER once about a takeaway order left waiting over 10 minutes", async () => {
      const waiting = await takeaway();
      const accepted = await takeaway();
      const recent = await takeaway();
      const dineInOrder = await dineIn("T7");
      await move("CASHIER", accepted.order.id, "ACCEPTED");
      const backdate = (id: number, modifier: string) =>
        dataSource.query(`UPDATE "orders" SET "created_at" = datetime('now', ?) WHERE "id" = ?`, [
          modifier,
          id,
        ]);
      for (const id of [waiting.order.id, accepted.order.id, dineInOrder.order.id]) {
        await backdate(id, "-12 minutes");
      }
      await backdate(recent.order.id, "-2 minutes");

      expect(await app.get(OrderEscalation).checkOverdue()).toBe(2);

      expect(await staffWith("ORDER_ACCEPTANCE_OVERDUE", waiting.order.id)).toEqual([
        "ADMIN",
        "MANAGER",
      ]);
      const [alert] = about(
        await inbox(staff.MANAGER),
        "ORDER_ACCEPTANCE_OVERDUE",
        waiting.order.id,
      );
      expect(alert).toMatchObject({
        priority: "HIGH",
        title: `Takeaway order ${waiting.order.orderNo} is waiting to be accepted`,
        body: `Placed 12 minutes ago and not accepted yet. Pickup code ${waiting.order.pickupCode} · 3 items · $29.30.`,
      });
      for (const other of [accepted, recent, dineInOrder]) {
        expect(await staffWith("ORDER_ACCEPTANCE_OVERDUE", other.order.id)).toEqual([]);
      }

      // Once per order, and never for orders from before yesterday.
      expect(await app.get(OrderEscalation).checkOverdue()).toBe(0);
      const old = await takeaway();
      await backdate(old.order.id, "-2 days");
      expect(await app.get(OrderEscalation).checkOverdue()).toBe(0);
    });
  });

  describe("floor", () => {
    const floor = (role: StaffRole) => ({
      status: (label: string, status: string) =>
        request(server())
          .patch(`/api/v1/floor/tables/${tables[label]}/status`)
          .set(bearer(staff[role]))
          .send({ status }),
    });

    it("sends a bill request to the cashier and a table to clean to the waiter", async () => {
      await floor("WAITER").status("T8", "OCCUPIED").expect(200);
      await floor("WAITER").status("T8", "BILL_REQUESTED").expect(200);
      // Repeating it is a no-op and notifies nobody again.
      await floor("WAITER").status("T8", "BILL_REQUESTED").expect(200);

      const [bill] = about(await inbox(staff.CASHIER), "TABLE_BILL_REQUESTED", tables.T8);
      expect(bill).toMatchObject({
        category: "FLOOR",
        priority: "HIGH",
        title: "Table T8 asked for the bill",
        body: "Bring the bill to table T8 (12 seats · Chef's table).",
        entityType: "TABLE",
      });
      // Sent to cashiers and waiters, but the waiter who asked is not told about it.
      expect(await staffWith("TABLE_BILL_REQUESTED", tables.T8)).toEqual(["CASHIER"]);

      await floor("CASHIER").status("T8", "CLEANING").expect(200);
      expect(await staffWith("TABLE_NEEDS_CLEANING", tables.T8)).toEqual(["WAITER"]);

      // A refused change notifies nobody.
      await floor("CASHIER").status("T8", "BILL_REQUESTED").expect(409);
      await floor("WAITER").status("T8", "FREE").expect(200);
      expect(about(await inbox(staff.CASHIER), "TABLE_BILL_REQUESTED", tables.T8)).toHaveLength(1);
    });

    it("tells ADMIN and MANAGER about layout changes made by the other", async () => {
      const created = await request(server())
        .post("/api/v1/floor/tables")
        .set(bearer(staff.MANAGER))
        .send({ label: "P1", seats: 2, zone: "Patio" })
        .expect(201);
      const id = created.body.table.id as number;

      const edit = (body: object) =>
        request(server())
          .patch(`/api/v1/floor/tables/${id}`)
          .set(bearer(staff.MANAGER))
          .send(body)
          .expect(200);
      await edit({ seats: 3 });
      await edit({ active: false });
      await edit({ active: false });
      await edit({ active: true });
      await request(server())
        .delete(`/api/v1/floor/tables/${id}`)
        .set(bearer(staff.MANAGER))
        .expect(204);

      const changes = (await inbox(staff.ADMIN))
        .filter((item) => item.type === "TABLE_LAYOUT_CHANGED" && item.entityId === id)
        .map((item) => item.title)
        .reverse();
      expect(changes).toEqual([
        "Table P1 was added",
        "Table P1 is out of service",
        "Table P1 is back in service",
        "Table P1 was removed",
      ]);
      expect(await staffWith("TABLE_LAYOUT_CHANGED", id)).toEqual(["ADMIN"]);
    });
  });
});
