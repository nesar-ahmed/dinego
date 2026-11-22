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
  checkoutQuoteResponseSchema,
  orderResponseSchema,
  staffBoardResponseSchema,
  staffFloorResponseSchema,
  type CustomerOrder,
  type StaffRole,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedMenu } from "../src/database/seeds/menu.seed.js";
import { seedTables } from "../src/database/seeds/tables.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { MenuItem } from "../src/menu/entities/menu-item.entity.js";
import { DiningTable } from "../src/tables/entities/dining-table.entity.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const STAFF_ROLES: StaffRole[] = ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN"];

describe("Staff dashboards API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const items: Record<string, number> = {};
  const tables: Record<string, number> = {};
  const staff = {} as Record<StaffRole, string>;
  let customerToken = "";

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  let counter = 0;
  /** A fresh customer checks out one smash burger and one lemonade. */
  const placeOrder = async (body: object): Promise<CustomerOrder> => {
    counter += 1;
    const registered = await request(server())
      .post("/api/v1/users/register")
      .send({
        name: `Board Customer ${counter}`,
        email: `board-${counter}-${Date.now()}@dinego.com`,
        password: "Password123!",
      })
      .expect(201);
    const token = registered.body.accessToken as string;
    customerToken = token;
    for (const slug of ["smash-burger", "house-lemonade"]) {
      await request(server())
        .post("/api/v1/cart/items")
        .set(bearer(token))
        .send({ menuItemId: items[slug], quantity: 1 })
        .expect(200);
    }
    const { totalCents } = checkoutQuoteResponseSchema.parse(
      (await request(server()).get("/api/v1/payments/quote").set(bearer(token)).expect(200)).body,
    ).quote;
    return orderResponseSchema.parse(
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
    ).order;
  };
  const takeaway = () => placeOrder({ orderType: "TAKEAWAY" });
  const dineIn = (label: string) => placeOrder({ orderType: "DINE_IN", tableId: tables[label] });

  const move = (role: StaffRole, orderId: number, status: string) =>
    request(server())
      .patch(`/api/v1/staff/orders/${orderId}/status`)
      .set(bearer(staff[role]))
      .send({ status })
      .expect(200);

  const board = async (role: StaffRole, query = "") =>
    staffBoardResponseSchema.parse(
      (
        await request(server())
          .get(`/api/v1/staff/board${query}`)
          .set(bearer(staff[role]))
          .expect(200)
      ).body,
    );
  const onBoard = async (role: StaffRole, orderId: number) =>
    (await board(role)).orders.find((order) => order.id === orderId);
  const floor = async (role: StaffRole = "WAITER") =>
    staffFloorResponseSchema.parse(
      (await request(server()).get("/api/v1/staff/floor").set(bearer(staff[role])).expect(200))
        .body,
    ).tables;

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-staff-dashboard-e2e-"));
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
    for (const table of await dataSource.getRepository(DiningTable).find()) {
      tables[table.label] = table.id;
    }

    ({ app, logs } = await createE2eApp());

    for (const role of STAFF_ROLES) {
      const { email, password } = userAccounts.find((entry) => entry.role === role)!;
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

  describe("access", () => {
    it("board: every staff role; floor: everyone but the kitchen; customers: neither", async () => {
      await takeaway();

      await request(server()).get("/api/v1/staff/board").expect(401);
      await request(server()).get("/api/v1/staff/floor").expect(401);
      await request(server()).get("/api/v1/staff/board").set(bearer(customerToken)).expect(403);
      await request(server()).get("/api/v1/staff/floor").set(bearer(customerToken)).expect(403);

      for (const role of STAFF_ROLES) {
        await request(server()).get("/api/v1/staff/board").set(bearer(staff[role])).expect(200);
        await request(server())
          .get("/api/v1/staff/floor")
          .set(bearer(staff[role]))
          .expect(role === "KITCHEN" ? 403 : 200);
      }
    });

    it("rejects an invalid board query", async () => {
      const response = await request(server())
        .get("/api/v1/staff/board?type=DELIVERY")
        .set(bearer(staff.KITCHEN))
        .expect(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      await request(server())
        .get("/api/v1/staff/board?status=SENT")
        .set(bearer(staff.KITCHEN))
        .expect(400);
    });
  });

  describe("board", () => {
    it("shows each role its orders with items and what it may do next", async () => {
      const dine = await dineIn("T1");
      const pickup = await takeaway();

      const kitchenDine = await onBoard("KITCHEN", dine.id);
      const kitchenPickup = await onBoard("KITCHEN", pickup.id);
      expect(kitchenDine?.actions).toEqual(["IN_PROGRESS", "READY"]);
      expect(kitchenPickup?.actions).toEqual(["ACCEPTED"]);
      expect(kitchenDine?.items.map((item) => [item.name, item.station, item.status])).toEqual([
        ["Smash burger", "GRILL", "FIRED"],
        ["House lemonade", "BAR", "FIRED"],
      ]);
      expect(kitchenDine?.table?.label).toBe("T1");
      expect(kitchenPickup?.pickupCode).toMatch(/^\d{4}$/);
      expect(kitchenPickup?.customer?.name).toMatch(/^Board Customer/);

      // The waiter sees the dine-in order but waits for the kitchen; no takeaway.
      expect((await onBoard("WAITER", dine.id))?.actions).toEqual([]);
      expect(await onBoard("WAITER", pickup.id)).toBeUndefined();
      // The cashier can accept the takeaway order; no dine-in.
      expect((await onBoard("CASHIER", pickup.id))?.actions).toEqual(["ACCEPTED"]);
      expect(await onBoard("CASHIER", dine.id)).toBeUndefined();
      // Managers see both and may also decline or cancel.
      expect((await onBoard("MANAGER", pickup.id))?.actions).toEqual([
        "ACCEPTED",
        "REJECTED",
        "CANCELLED",
      ]);
      expect((await onBoard("ADMIN", dine.id))?.actions).toContain("CANCELLED");
    });

    it("lists the oldest order first and can be narrowed to one order type", async () => {
      const first = await takeaway();
      const second = await takeaway();
      const ids = (await board("KITCHEN")).orders.map((order) => order.id);
      expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));

      const onlyTakeaway = await board("KITCHEN", "?type=TAKEAWAY");
      expect(onlyTakeaway.orders.length).toBeGreaterThan(0);
      expect(onlyTakeaway.orders.every((order) => order.type === "TAKEAWAY")).toBe(true);
      expect(onlyTakeaway.hasMore).toBe(false);
      // A waiter has no takeaway board.
      expect((await board("WAITER", "?type=TAKEAWAY")).orders).toEqual([]);
    });

    it("follows a dine-in order from the kitchen to the table, then drops it when closed", async () => {
      const order = await dineIn("T2");

      await move("KITCHEN", order.id, "IN_PROGRESS");
      expect((await onBoard("KITCHEN", order.id))?.actions).toEqual(["READY"]);
      await move("KITCHEN", order.id, "READY");
      expect((await onBoard("KITCHEN", order.id))?.actions).toEqual([]);
      expect((await onBoard("WAITER", order.id))?.actions).toEqual(["SERVED"]);
      await move("WAITER", order.id, "SERVED");
      expect(await onBoard("KITCHEN", order.id)).toBeUndefined();
      expect((await onBoard("WAITER", order.id))?.actions).toEqual(["CLOSED"]);
      await move("WAITER", order.id, "CLOSED");
      expect(await onBoard("WAITER", order.id)).toBeUndefined();
      expect(await onBoard("ADMIN", order.id)).toBeUndefined();
    });

    it("follows a takeaway order from acceptance to hand-over", async () => {
      const order = await takeaway();

      await move("CASHIER", order.id, "ACCEPTED");
      expect((await onBoard("CASHIER", order.id))?.actions).toEqual([]);
      expect((await onBoard("KITCHEN", order.id))?.actions).toEqual([
        "PREPARING",
        "READY_FOR_PICKUP",
      ]);
      await move("KITCHEN", order.id, "PREPARING");
      await move("KITCHEN", order.id, "READY_FOR_PICKUP");
      expect((await onBoard("CASHIER", order.id))?.actions).toEqual(["COLLECTED", "NO_SHOW"]);
      await move("CASHIER", order.id, "COLLECTED");
      expect(await onBoard("CASHIER", order.id)).toBeUndefined();
      expect(await onBoard("KITCHEN", order.id)).toBeUndefined();
    });
  });

  describe("floor", () => {
    it("shows open orders per table and keeps a table with open orders from being cleaned", async () => {
      const order = await dineIn("T3");
      const table = () => floor().then((all) => all.find((entry) => entry.label === "T3")!);

      let t3 = await table();
      expect(t3.status).toBe("OCCUPIED");
      expect(t3.openOrders).toEqual([{ id: order.id, orderNo: order.orderNo, status: "SENT" }]);
      expect(t3.actions).toEqual(["BILL_REQUESTED"]);

      await move("KITCHEN", order.id, "READY");
      await move("WAITER", order.id, "SERVED");
      expect((await table()).openOrders[0]?.status).toBe("SERVED");
      await move("WAITER", order.id, "CLOSED");

      t3 = await table();
      expect(t3.openOrders).toEqual([]);
      expect(t3.actions).toEqual(["BILL_REQUESTED", "CLEANING", "FREE"]);
      // The cashier sees the same floor.
      expect((await floor("CASHIER")).find((entry) => entry.label === "T3")?.actions).toEqual(
        t3.actions,
      );
    });

    it("lists tables in floor-plan order, and out-of-service tables have no actions", async () => {
      await request(server())
        .patch(`/api/v1/floor/tables/${tables.T8}`)
        .set(bearer(staff.MANAGER))
        .send({ active: false })
        .expect(200);

      const all = await floor();
      expect(all.map((entry) => entry.label)).toEqual([
        "T1",
        "T2",
        "T3",
        "T4",
        "T5",
        "T6",
        "T7",
        "T8",
      ]);
      const t8 = all.find((entry) => entry.label === "T8")!;
      expect(t8.active).toBe(false);
      expect(t8.actions).toEqual([]);
      expect(all.find((entry) => entry.label === "T4")?.actions).toEqual([
        "OCCUPIED",
        "RESERVED",
        "CLEANING",
      ]);
    });
  });
});
