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
  paymentResponseSchema,
  paymentsResponseSchema,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedMenu } from "../src/database/seeds/menu.seed.js";
import { seedTables } from "../src/database/seeds/tables.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { MenuItem } from "../src/menu/entities/menu-item.entity.js";
import { DiningTable } from "../src/tables/entities/dining-table.entity.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const admin = userAccounts.find((account) => account.role === "ADMIN")!;

/** Smash burger is taxed in this suite: 2 × $12.90 at 8.875% = $2.29 tax. */
const BURGER_TAX_RATE = 8.875;

describe("Payments API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const items: Record<string, number> = {};
  const prices: Record<string, number> = {};
  const tables: Record<string, number> = {};

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  let customerCounter = 0;
  const newCustomer = async (
    cart: Record<string, number> = { "smash-burger": 2, "house-lemonade": 1 },
  ) => {
    customerCounter += 1;
    const response = await request(server())
      .post("/api/v1/users/register")
      .send({
        name: `Pay Customer ${customerCounter}`,
        email: `pay-${customerCounter}-${Date.now()}@dinego.com`,
        password: "Password123!",
      })
      .expect(201);
    const token = response.body.accessToken as string;

    for (const [slug, quantity] of Object.entries(cart)) {
      await request(server())
        .post("/api/v1/cart/items")
        .set(bearer(token))
        .send({ menuItemId: items[slug], quantity })
        .expect(200);
    }

    return { token, id: response.body.customer.id as number };
  };

  const quote = async (token: string, tipCents = 0) =>
    checkoutQuoteResponseSchema.parse(
      (
        await request(server())
          .get(`/api/v1/payments/quote?tipCents=${tipCents}`)
          .set(bearer(token))
          .expect(200)
      ).body,
    ).quote;

  /** Checks out (POST /orders) with the quoted total, expecting `status`. */
  const checkout = async (token: string, body: object, status: number) => {
    const { totalCents } = await quote(token);
    return request(server())
      .post("/api/v1/orders")
      .set(bearer(token))
      .set("Idempotency-Key", randomUUID())
      .send({ method: "CARD", paymentToken: "tok_visa", expectedTotalCents: totalCents, ...body })
      .expect(status);
  };

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-payments-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");

    dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
      await seedMenu(manager);
      await seedTables(manager);
      await manager
        .getRepository(MenuItem)
        .update({ slug: "smash-burger" }, { taxRate: BURGER_TAX_RATE });
    });

    for (const item of await dataSource.getRepository(MenuItem).find()) {
      items[item.slug] = item.id;
      prices[item.slug] = item.priceCents;
    }
    for (const table of await dataSource.getRepository(DiningTable).find()) {
      tables[table.label] = table.id;
    }

    ({ app, logs } = await createE2eApp());
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
    it("requires an active customer", async () => {
      await request(server()).get("/api/v1/payments/quote").expect(401);

      const staff = await request(server())
        .post("/api/v1/users/staff/login")
        .send({ email: admin.email, password: admin.password })
        .expect(200);
      const forbidden = await request(server())
        .get("/api/v1/payments")
        .set(bearer(staff.body.accessToken))
        .expect(403);
      expect(forbidden.body).toMatchObject({ code: "CUSTOMER_ONLY" });

      const customer = await newCustomer();
      await dataSource.query(`UPDATE "users" SET "active" = 0 WHERE "id" = ?`, [customer.id]);
      await request(server()).get("/api/v1/payments/quote").set(bearer(customer.token)).expect(401);
      await request(server()).get("/api/v1/payments").set(bearer(customer.token)).expect(401);
    });

    it("has no standalone payment endpoint: paying always places an order", async () => {
      const { token } = await newCustomer();
      await request(server())
        .post("/api/v1/payments")
        .set(bearer(token))
        .set("Idempotency-Key", randomUUID())
        .send({
          orderType: "TAKEAWAY",
          method: "CARD",
          paymentToken: "tok_visa",
          expectedTotalCents: 1,
        })
        .expect(404);
    });
  });

  describe("quote", () => {
    it("prices the cart with tax and tip", async () => {
      const { token } = await newCustomer();
      const burger = prices["smash-burger"];
      const lemonade = prices["house-lemonade"];
      const tax = Math.round((2 * burger * BURGER_TAX_RATE) / 100); // lemonade is untaxed

      expect(await quote(token, 300)).toEqual({
        lines: [
          {
            menuItemId: items["smash-burger"],
            name: "Smash burger",
            quantity: 2,
            unitPriceCents: burger,
            lineTotalCents: 2 * burger,
          },
          {
            menuItemId: items["house-lemonade"],
            name: "House lemonade",
            quantity: 1,
            unitPriceCents: lemonade,
            lineTotalCents: lemonade,
          },
        ],
        itemCount: 3,
        subtotalCents: 2 * burger + lemonade,
        taxCents: tax,
        tipCents: 300,
        totalCents: 2 * burger + lemonade + tax + 300,
      });
      expect(tax).toBe(229); // 2 × $12.90 × 8.875% = $2.28975
    });

    it("refuses an empty cart and a cart with unavailable items", async () => {
      const empty = await newCustomer({});
      const emptyResponse = await request(server())
        .get("/api/v1/payments/quote")
        .set(bearer(empty.token))
        .expect(409);
      expect(emptyResponse.body).toMatchObject({ code: "CART_EMPTY" });

      const { token } = await newCustomer({ "ribeye-steak": 1, "gelato-trio": 1 });
      await dataSource.query(`UPDATE "menu_items" SET "available" = 0 WHERE "id" = ?`, [
        items["ribeye-steak"],
      ]);
      try {
        const response = await request(server())
          .get("/api/v1/payments/quote")
          .set(bearer(token))
          .expect(409);
        expect(response.body).toMatchObject({
          code: "CART_HAS_UNAVAILABLE_ITEMS",
          menuItemIds: [items["ribeye-steak"]],
        });
      } finally {
        await dataSource.query(`UPDATE "menu_items" SET "available" = 1 WHERE "id" = ?`, [
          items["ribeye-steak"],
        ]);
      }
    });

    it("rejects invalid tips", async () => {
      const { token } = await newCustomer();
      await request(server())
        .get("/api/v1/payments/quote?tipCents=1.5")
        .set(bearer(token))
        .expect(400);
      await request(server()).get("/api/v1/payments/quote?tip=5").set(bearer(token)).expect(400);
    });
  });

  describe("history", () => {
    it("lists my dummy payments, including declines, newest first", async () => {
      const customer = await newCustomer();
      await checkout(customer.token, { orderType: "TAKEAWAY", paymentToken: "tok_declined" }, 402);
      await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "tok_expired_card" },
        402,
      );
      const placed = await checkout(customer.token, { orderType: "TAKEAWAY" }, 201);

      const page = paymentsResponseSchema.parse(
        (
          await request(server())
            .get("/api/v1/payments?pageSize=2")
            .set(bearer(customer.token))
            .expect(200)
        ).body,
      );
      expect(page.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
      expect(page.payments.map((payment) => [payment.status, payment.orderId])).toEqual([
        ["SUCCEEDED", placed.body.order.id],
        ["FAILED", null],
      ]);
      expect(page.payments[1]).toMatchObject({
        failureCode: "expired_card",
        failureMessage: "Your card has expired.",
      });

      const [paid] = page.payments;
      const one = await request(server())
        .get(`/api/v1/payments/${paid.id}`)
        .set(bearer(customer.token))
        .expect(200);
      expect(paymentResponseSchema.parse(one.body).payment).toMatchObject({
        id: paid.id,
        amountCents: placed.body.order.totalCents,
        lines: [
          expect.objectContaining({ name: "Smash burger", quantity: 2 }),
          expect.objectContaining({ name: "House lemonade", quantity: 1 }),
        ],
      });

      const other = await newCustomer({});
      const hidden = await request(server())
        .get(`/api/v1/payments/${paid.id}`)
        .set(bearer(other.token))
        .expect(404);
      expect(hidden.body).toMatchObject({ code: "PAYMENT_NOT_FOUND" });
      await request(server()).get("/api/v1/payments/abc").set(bearer(other.token)).expect(400);
    });

    it("keeps tables with order history from being deleted", async () => {
      const customer = await newCustomer();
      await checkout(customer.token, { orderType: "DINE_IN", tableId: tables.T2 }, 201);

      const staff = await request(server())
        .post("/api/v1/users/staff/login")
        .send({ email: admin.email, password: admin.password })
        .expect(200);
      await request(server())
        .patch(`/api/v1/floor/tables/${tables.T2}/status`)
        .set(bearer(staff.body.accessToken))
        .send({ status: "FREE" })
        .expect(200);
      const response = await request(server())
        .delete(`/api/v1/floor/tables/${tables.T2}`)
        .set(bearer(staff.body.accessToken))
        .expect(409);
      expect(response.body).toMatchObject({
        code: "TABLE_IN_USE",
        message: expect.stringContaining("history"),
      });
    });
  });
});
