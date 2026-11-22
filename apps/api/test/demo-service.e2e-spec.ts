import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  notificationsResponseSchema,
  ordersResponseSchema,
  staffBoardResponseSchema,
  staffFloorResponseSchema,
  type StaffRole,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { demoOrders, seedDemoService } from "../src/database/seeds/demo-service.seed.js";
import { seedMenu } from "../src/database/seeds/menu.seed.js";
import { seedTables } from "../src/database/seeds/tables.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const login = (role: string) => userAccounts.find((entry) => entry.role === role)!;

/** A migrated database with the users, menu, and tables seeded. */
async function baseDatabase(path: string): Promise<DataSource> {
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path;
  const dataSource = new DataSource(buildDataSourceOptions());
  process.env.DATABASE_PATH = previous;

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.transaction(async (manager) => {
    await seedUsers(manager);
    await seedMenu(manager);
    await seedTables(manager);
  });
  return dataSource;
}

const count = async (dataSource: DataSource, table: string) =>
  Number((await dataSource.query(`SELECT COUNT(*) AS "n" FROM "${table}"`))[0].n);

describe("Demo service seed (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const tokens = {} as Record<StaffRole | "SOFIA", string>;

  const server = () => app.getHttpServer();
  const get = (path: string, token: string) =>
    request(server())
      .get(`/api/v1${path}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200)
      .then((response) => response.body as unknown);
  const board = async (role: StaffRole) =>
    staffBoardResponseSchema.parse(await get("/staff/board", tokens[role])).orders;
  const unread = async (token: string) =>
    notificationsResponseSchema
      .parse(await get("/notifications?pageSize=50&unread=true", token))
      .notifications.map((item) => item.title);

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-demo-service-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "demo.sqlite");
    dataSource = await baseDatabase(process.env.DATABASE_PATH);

    const result = await seedDemoService(dataSource);
    expect(result).toEqual({ created: true, orders: demoOrders.length, skipped: [] });

    ({ app, logs } = await createE2eApp());
    for (const role of ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN", "CUSTOMER"]) {
      const { email, password } = login(role);
      const token = (
        await request(server()).post("/api/v1/users/session-login").send({ email, password })
      ).body.accessToken as string;
      tokens[role === "CUSTOMER" ? "SOFIA" : (role as StaffRole)] = token;
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

  it("fills every column of the kitchen board, oldest first, with a late ticket", async () => {
    const orders = await board("KITCHEN");
    const statuses = new Set(orders.map((order) => `${order.type}:${order.status}`));

    for (const expected of [
      "DINE_IN:SENT",
      "DINE_IN:IN_PROGRESS",
      "DINE_IN:READY",
      "TAKEAWAY:PLACED",
      "TAKEAWAY:ACCEPTED",
      "TAKEAWAY:PREPARING",
      "TAKEAWAY:READY_FOR_PICKUP",
    ]) {
      expect(statuses, expected).toContain(expected);
    }
    const created = orders.map((order) => order.createdAt);
    expect(created).toEqual([...created].sort());

    const minutesAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60_000;
    const late = orders.find((order) => order.table?.label === "T3")!;
    expect(minutesAgo(late.createdAt)).toBeGreaterThan(20);
    expect(minutesAgo(late.createdAt)).toBeLessThan(26);
    expect(late.items.every((item) => item.status === "PREPARING")).toBe(true);
  });

  it("gives the waiter and the cashier something to do", async () => {
    const waiter = await board("WAITER");
    expect(waiter.every((order) => order.type === "DINE_IN")).toBe(true);
    expect(waiter.find((order) => order.status === "READY")?.actions).toEqual(["SERVED"]);
    expect(waiter.find((order) => order.status === "SERVED")?.actions).toEqual(["CLOSED"]);

    const cashier = await board("CASHIER");
    expect(cashier.every((order) => order.type === "TAKEAWAY")).toBe(true);
    expect(cashier.filter((order) => order.status === "PLACED")).toHaveLength(2);
    expect(cashier.find((order) => order.status === "READY_FOR_PICKUP")?.actions).toEqual([
      "COLLECTED",
      "NO_SHOW",
    ]);
  });

  it("sets the floor: occupied, reserved, needs cleaning, and free tables", async () => {
    const tables = staffFloorResponseSchema.parse(await get("/staff/floor", tokens.WAITER)).tables;
    const status = Object.fromEntries(tables.map((table) => [table.label, table.status]));

    expect(status).toEqual({
      T1: "OCCUPIED",
      T2: "OCCUPIED",
      T3: "OCCUPIED",
      T4: "RESERVED",
      T5: "OCCUPIED",
      T6: "CLEANING",
      T7: "OCCUPIED",
      T8: "FREE",
    });
    const t6 = tables.find((table) => table.label === "T6")!;
    expect(t6.openOrders).toEqual([]);
    expect(t6.actions).toEqual(["FREE"]);
    expect(tables.find((table) => table.label === "T1")!.openOrders).toHaveLength(1);
  });

  it("notifies each role about what is waiting for it, and history is already read", async () => {
    expect(await unread(tokens.WAITER)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/is ready for table T5$/),
        "Table T6 needs cleaning",
      ]),
    );
    expect(await unread(tokens.CASHIER)).toEqual(
      expect.arrayContaining([expect.stringMatching(/is ready for pickup$/)]),
    );
    const kitchen = await unread(tokens.KITCHEN);
    expect(kitchen.filter((title) => title.startsWith("New "))).not.toHaveLength(0);
    // Collected and not-collected orders are history.
    expect(kitchen.join("\n")).not.toMatch(/was not collected/);

    const sofia = ordersResponseSchema.parse(await get("/orders?pageSize=50", tokens.SOFIA));
    expect(sofia.orders.map((order) => order.status)).toEqual(
      expect.arrayContaining(["SENT", "COLLECTED"]),
    );
  });

  it("can be worked through from the seeded state", async () => {
    const ready = (await board("WAITER")).find((order) => order.status === "READY")!;
    await request(server())
      .patch(`/api/v1/staff/orders/${ready.id}/status`)
      .set({ Authorization: `Bearer ${tokens.WAITER}` })
      .send({ status: "SERVED" })
      .expect(200);
  });

  it("runs once: seeding again changes nothing", async () => {
    const before = await Promise.all(
      ["orders", "payments", "notifications"].map((table) => count(dataSource, table)),
    );
    expect(await seedDemoService(dataSource)).toEqual({
      created: false,
      orders: demoOrders.length,
      skipped: [],
    });
    expect(
      await Promise.all(
        ["orders", "payments", "notifications"].map((table) => count(dataSource, table)),
      ),
    ).toEqual(before);
  });

  it("never orders what a customer already has in their cart", async () => {
    const other = await baseDatabase(join(databaseDir, "cart.sqlite"));
    try {
      const [alex] = await other.query(
        `SELECT "id" FROM "users" WHERE "email" = 'alex@dinego.com'`,
      );
      const [cart] = await other.query(
        `INSERT INTO "carts" ("customer_id") VALUES (?) RETURNING "id"`,
        [alex.id],
      );
      const [menuItem] = await other.query(`SELECT "id" FROM "menu_items" LIMIT 1`);
      await other.query(
        `INSERT INTO "cart_items" ("cart_id", "menu_item_id", "quantity") VALUES (?, ?, 3)`,
        [cart.id, menuItem.id],
      );

      const result = await seedDemoService(other);
      const alexOrders = demoOrders.filter((demo) => demo.customer === "alex@dinego.com");
      expect(result.orders).toBe(demoOrders.length - alexOrders.length);
      expect(result.skipped).toHaveLength(alexOrders.length);
      expect(result.skipped[0]).toMatch(/alex@dinego.com has items in their cart/);
      expect(
        await other.query(
          `SELECT "menu_item_id", "quantity" FROM "cart_items" WHERE "cart_id" = ?`,
          [cart.id],
        ),
      ).toEqual([{ menu_item_id: menuItem.id, quantity: 3 }]);
    } finally {
      await other.destroy();
    }
  });
});
