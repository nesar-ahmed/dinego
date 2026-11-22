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
  orderResponseSchema,
  ordersResponseSchema,
} from "@dinego/shared";
import { runAtomically } from "../src/common/database/atomic.js";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedMenu } from "../src/database/seeds/menu.seed.js";
import { seedTables } from "../src/database/seeds/tables.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { MenuItem } from "../src/menu/entities/menu-item.entity.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { DiningTable } from "../src/tables/entities/dining-table.entity.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const admin = userAccounts.find((account) => account.role === "ADMIN")!;
const seededCustomer = userAccounts.find((account) => account.role === "CUSTOMER")!;

/** Smash burger is taxed in this suite: 2 × $12.90 at 8.875% = $2.29 tax. */
const BURGER_TAX_RATE = 8.875;

describe("Orders API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const items: Record<string, number> = {};
  const prices: Record<string, number> = {};
  const stations: Record<string, string> = {};
  const tables: Record<string, number> = {};

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  let customerCounter = 0;
  /** A fresh customer with the given cart, so each test owns its orders and payments. */
  const newCustomer = async (
    cart: Record<string, number> = { "smash-burger": 2, "house-lemonade": 1 },
  ) => {
    customerCounter += 1;
    const response = await request(server())
      .post("/api/v1/users/register")
      .send({
        name: `Order Customer ${customerCounter}`,
        email: `order-${customerCounter}-${Date.now()}@dinego.com`,
        password: "Password123!",
      })
      .expect(201);
    const token = response.body.accessToken as string;
    await fillCart(token, cart);
    return { token, id: response.body.customer.id as number };
  };

  const fillCart = async (token: string, cart: Record<string, number>) => {
    for (const [slug, quantity] of Object.entries(cart)) {
      await request(server())
        .post("/api/v1/cart/items")
        .set(bearer(token))
        .send({ menuItemId: items[slug], quantity })
        .expect(200);
    }
  };

  const cartLines = async (token: string) =>
    (
      await request(server()).get("/api/v1/cart").set(bearer(token)).expect(200)
    ).body.cart.items.map((line: { item: { slug: string }; quantity: number }) => [
      line.item.slug,
      line.quantity,
    ]);

  const quote = async (token: string, tipCents = 0) =>
    checkoutQuoteResponseSchema.parse(
      (
        await request(server())
          .get(`/api/v1/payments/quote?tipCents=${tipCents}`)
          .set(bearer(token))
          .expect(200)
      ).body,
    ).quote;

  const post = (token: string, body: object, key: string | null = randomUUID()) => {
    const call = request(server()).post("/api/v1/orders").set(bearer(token));
    return (key === null ? call : call.set("Idempotency-Key", key)).send(body);
  };

  /** Quotes, then checks out with exactly the quoted total, expecting `status`. */
  const checkout = async (token: string, body: object, status: number, key?: string) => {
    const { totalCents } = await quote(token, (body as { tipCents?: number }).tipCents ?? 0);
    return post(
      token,
      { method: "CARD", paymentToken: "tok_visa", expectedTotalCents: totalCents, ...body },
      key,
    ).expect(status);
  };

  const count = async (table: "orders" | "payments", customerId: number) => {
    const [{ total }] = await dataSource.query(
      `SELECT COUNT(*) AS total FROM "${table}" WHERE "customer_id" = ?`,
      [customerId],
    );
    return total as number;
  };

  const tableStatus = async (label: string) =>
    (await dataSource.getRepository(DiningTable).findOneByOrFail({ label })).status;
  const setTable = (label: string, changes: Partial<DiningTable>) =>
    dataSource.getRepository(DiningTable).update({ label }, changes);

  /** A payment left behind by a crash, as the API would have stored it. */
  const insertInterruptedPayment = async (
    customerId: number,
    status: "PENDING" | "SUCCEEDED",
    lines: Array<{ slug: string; quantity: number }>,
  ) => {
    const snapshot = lines.map(({ slug, quantity }) => ({
      menuItemId: items[slug],
      name: slug,
      quantity,
      unitPriceCents: prices[slug],
      taxRate: 0,
      station: stations[slug],
      lineTotalCents: prices[slug] * quantity,
      taxCents: 0,
    }));
    const subtotal = snapshot.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const [{ id }] = await dataSource.query(
      `INSERT INTO "payments" ("customer_id", "order_type", "method", "subtotal_cents",
         "tax_cents", "tip_cents", "amount_cents", "lines", "status", "provider", "provider_ref",
         "idempotency_key", "request_hash")
       VALUES (?, 'TAKEAWAY', 'CARD', ?, 0, 0, ?, ?, ?, 'simulated', ?, ?, 'crash')
       RETURNING "id"`,
      [
        customerId,
        subtotal,
        subtotal,
        JSON.stringify(snapshot),
        status,
        status === "SUCCEEDED" ? "sim_ch_crash" : null,
        randomUUID(),
      ],
    );
    return id as number;
  };

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-orders-e2e-"));
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
      stations[item.slug] = item.station;
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
      await request(server()).get("/api/v1/orders").expect(401);
      await post("not-a-token", { orderType: "TAKEAWAY" }).expect(401);

      const staff = await request(server())
        .post("/api/v1/users/staff/login")
        .send({ email: admin.email, password: admin.password })
        .expect(200);
      const forbidden = await request(server())
        .get("/api/v1/orders")
        .set(bearer(staff.body.accessToken))
        .expect(403);
      expect(forbidden.body).toMatchObject({ code: "CUSTOMER_ONLY" });

      const customer = await newCustomer();
      await dataSource.query(`UPDATE "users" SET "active" = 0 WHERE "id" = ?`, [customer.id]);
      await post(customer.token, {
        orderType: "TAKEAWAY",
        method: "CARD",
        paymentToken: "tok_visa",
        expectedTotalCents: 1,
      }).expect(401);
      await request(server()).get("/api/v1/orders").set(bearer(customer.token)).expect(401);
      expect(await count("payments", customer.id)).toBe(0);
    });

    it("checks out with the HttpOnly session cookie", async () => {
      const agent = request.agent(server());
      await agent
        .post("/api/v1/users/login")
        .send({ email: seededCustomer.email, password: seededCustomer.password })
        .expect(200);
      await agent.post("/api/v1/cart/items").send({ menuItemId: items["gelato-trio"] }).expect(200);
      const { totalCents } = (await agent.get("/api/v1/payments/quote").expect(200)).body.quote;

      const placed = await agent
        .post("/api/v1/orders")
        .set("Idempotency-Key", randomUUID())
        .send({
          orderType: "TAKEAWAY",
          method: "CARD",
          paymentToken: "tok_visa",
          expectedTotalCents: totalCents,
        })
        .expect(201);
      expect(placed.body.order.items).toHaveLength(1);
      expect((await agent.get("/api/v1/orders").expect(200)).body.orders[0].id).toBe(
        placed.body.order.id,
      );
    });
  });

  describe("checkout", () => {
    it("places a takeaway order with only a payment, and empties the cart", async () => {
      const customer = await newCustomer();
      const response = await checkout(
        customer.token,
        { orderType: "TAKEAWAY", tipCents: 300 },
        201,
      );
      const { order } = orderResponseSchema.parse(response.body);
      const subtotal = 2 * prices["smash-burger"] + prices["house-lemonade"];

      expect(order).toMatchObject({
        type: "TAKEAWAY",
        status: "PLACED",
        table: null,
        itemCount: 3,
        subtotalCents: subtotal,
        taxCents: 229,
        tipCents: 300,
        totalCents: subtotal + 229 + 300,
        pickupTime: null,
        notes: null,
      });
      expect(order.orderNo).toMatch(/^DG-\d{5}$/);
      expect(order.pickupCode).toMatch(/^\d{4}$/);
      expect(
        order.items.map((item) => [item.name, item.quantity, item.unitPriceCents, item.status]),
      ).toEqual([
        ["Smash burger", 2, prices["smash-burger"], "PENDING"],
        ["House lemonade", 1, prices["house-lemonade"], "PENDING"],
      ]);
      expect(order.payments).toEqual([
        expect.objectContaining({
          method: "CARD",
          status: "SUCCEEDED",
          amountCents: order.totalCents,
        }),
      ]);

      const [payment] = await dataSource.query(`SELECT * FROM "payments" WHERE "customer_id" = ?`, [
        customer.id,
      ]);
      expect(payment).toMatchObject({
        status: "SUCCEEDED",
        order_id: order.id,
        provider: "simulated",
      });
      expect(payment.provider_ref).toMatch(/^sim_ch_/);

      const stored = await dataSource.query(
        `SELECT "station", "fired_at" FROM "order_items" WHERE "order_id" = ? ORDER BY "id"`,
        [order.id],
      );
      expect(stored).toEqual([
        { station: stations["smash-burger"], fired_at: null },
        { station: stations["house-lemonade"], fired_at: null },
      ]);

      expect(await cartLines(customer.token)).toEqual([]);
    });

    it("places a dine-in order at a free table, fires it to the kitchen, and seats the table", async () => {
      await setTable("T3", { status: "FREE" });
      const customer = await newCustomer();

      const { order } = orderResponseSchema.parse(
        (await checkout(customer.token, { orderType: "DINE_IN", tableId: tables.T3 }, 201)).body,
      );

      expect(order).toMatchObject({
        type: "DINE_IN",
        status: "SENT",
        table: { id: tables.T3, label: "T3" },
        pickupCode: null,
      });
      expect(order.items.every((item) => item.status === "FIRED")).toBe(true);
      const [{ missing }] = await dataSource.query(
        `SELECT COUNT(*) AS missing FROM "order_items" WHERE "order_id" = ? AND "fired_at" IS NULL`,
        [order.id],
      );
      expect(missing).toBe(0);
      expect(await tableStatus("T3")).toBe("OCCUPIED");
    });

    it("lets a seated party order again at its occupied table", async () => {
      await setTable("T5", { status: "OCCUPIED" });
      const customer = await newCustomer({ "gelato-trio": 1 });

      await checkout(
        customer.token,
        { orderType: "DINE_IN", tableId: tables.T5, method: "ONLINE", paymentToken: "tok_wallet" },
        201,
      );
      await fillCart(customer.token, { "house-lemonade": 2 });
      await checkout(customer.token, { orderType: "DINE_IN", tableId: tables.T5 }, 201);

      expect(await count("orders", customer.id)).toBe(2);
      expect(await tableStatus("T5")).toBe("OCCUPIED");
    });

    it("refuses unknown, out-of-service, and unavailable tables without charging", async () => {
      const customer = await newCustomer();

      expect(
        (await checkout(customer.token, { orderType: "DINE_IN", tableId: 999_999 }, 404)).body,
      ).toMatchObject({ code: "TABLE_NOT_FOUND" });

      await setTable("T6", { active: false });
      await checkout(customer.token, { orderType: "DINE_IN", tableId: tables.T6 }, 404);
      await setTable("T6", { active: true });

      for (const status of ["CLEANING", "RESERVED", "BILL_REQUESTED"] as const) {
        await setTable("T7", { status });
        const busy = await checkout(
          customer.token,
          { orderType: "DINE_IN", tableId: tables.T7 },
          409,
        );
        expect(busy.body).toMatchObject({ code: "TABLE_NOT_AVAILABLE", tableId: tables.T7 });
      }
      await setTable("T7", { status: "FREE" });

      expect(await count("payments", customer.id)).toBe(0);
      expect(await count("orders", customer.id)).toBe(0);
      expect(await cartLines(customer.token)).toHaveLength(2);
    });

    it("refuses empty carts, unavailable items, and totals the customer was not shown", async () => {
      const empty = await newCustomer({});
      expect(
        (
          await post(empty.token, {
            orderType: "TAKEAWAY",
            method: "CARD",
            paymentToken: "tok_visa",
            expectedTotalCents: 100,
          }).expect(409)
        ).body,
      ).toMatchObject({ code: "CART_EMPTY" });

      const customer = await newCustomer({ "fish-and-chips": 1 });
      const shown = await quote(customer.token);
      await dataSource.query(
        `UPDATE "menu_items" SET "price_cents" = "price_cents" + 100 WHERE "id" = ?`,
        [items["fish-and-chips"]],
      );
      try {
        const changed = await post(customer.token, {
          orderType: "TAKEAWAY",
          method: "CARD",
          paymentToken: "tok_visa",
          expectedTotalCents: shown.totalCents,
        }).expect(409);
        expect(changed.body).toMatchObject({
          code: "TOTAL_CHANGED",
          quote: { totalCents: shown.totalCents + 100 },
        });
      } finally {
        await dataSource.query(
          `UPDATE "menu_items" SET "price_cents" = "price_cents" - 100 WHERE "id" = ?`,
          [items["fish-and-chips"]],
        );
      }

      await dataSource.query(`UPDATE "menu_items" SET "available" = 0 WHERE "id" = ?`, [
        items["fish-and-chips"],
      ]);
      try {
        const soldOut = await post(customer.token, {
          orderType: "TAKEAWAY",
          method: "CARD",
          paymentToken: "tok_visa",
          expectedTotalCents: shown.totalCents,
        }).expect(409);
        expect(soldOut.body).toMatchObject({ code: "CART_HAS_UNAVAILABLE_ITEMS" });
      } finally {
        await dataSource.query(`UPDATE "menu_items" SET "available" = 1 WHERE "id" = ?`, [
          items["fish-and-chips"],
        ]);
      }

      expect(await count("payments", customer.id)).toBe(0);
    });
  });

  describe("dummy payment outcomes", () => {
    it("places no order when the dummy card is declined, and accepts a retry", async () => {
      const customer = await newCustomer();

      const declined = await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "tok_declined" },
        402,
      );
      expect(apiErrorSchema.parse(declined.body)).toMatchObject({
        code: "PAYMENT_DECLINED",
        message: "Your card was declined.",
      });
      expect(declined.body).toMatchObject({
        paymentId: expect.any(Number),
        failureCode: "card_declined",
      });
      expect(await count("orders", customer.id)).toBe(0);
      expect(await cartLines(customer.token)).toHaveLength(2);

      await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "tok_mastercard" },
        201,
      );
      expect(await count("orders", customer.id)).toBe(1);
    });

    it("handles a dummy provider outage: 502, nothing charged, and the API keeps serving", async () => {
      const customer = await newCustomer();
      const key = randomUUID();
      const outage = await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "tok_provider_error" },
        502,
        key,
      );

      expect(outage.body).toMatchObject({
        code: "PAYMENT_PROVIDER_ERROR",
        paymentId: expect.any(Number),
      });
      // The outage is logged once, as a handled failure with context and no stack trace.
      const logged = logs.expectError(
        new RegExp(
          `Payment ${outage.body.paymentId} not charged: payment provider "simulated" is unavailable`,
        ),
      );
      expect(logged).not.toMatch(/\n\s+at /);

      const [payment] = await dataSource.query(
        `SELECT "status", "failure_code", "order_id" FROM "payments" WHERE "id" = ?`,
        [outage.body.paymentId],
      );
      expect(payment).toEqual({ status: "FAILED", failure_code: "provider_error", order_id: null });
      expect(await count("orders", customer.id)).toBe(0);
      expect(await cartLines(customer.token)).toHaveLength(2);

      // The API is still up, and retrying the same request replays the outcome without re-charging.
      await request(server()).get("/api/v1/health").expect(200);
      await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "tok_provider_error" },
        502,
        key,
      );
      expect(await count("payments", customer.id)).toBe(1);

      // Once the provider is back, a new attempt places the order.
      await checkout(customer.token, { orderType: "TAKEAWAY", paymentToken: "tok_visa" }, 201);
      expect(await count("orders", customer.id)).toBe(1);
    });

    it("declines anything that is not a dummy test token, such as a card number", async () => {
      const customer = await newCustomer();
      const response = await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "4242424242424242" },
        402,
      );
      expect(response.body).toMatchObject({ failureCode: "invalid_payment_token" });
    });
  });

  describe("idempotency and double submits", () => {
    it("returns the same order when a checkout is retried with the same key", async () => {
      const customer = await newCustomer();
      const key = randomUUID();
      const body = { orderType: "TAKEAWAY" };

      const first = await checkout(customer.token, body, 201, key);
      // The cart is now empty, but a retry must still return the original order.
      const { totalCents } = first.body.order;
      const retry = await post(
        customer.token,
        { ...body, method: "CARD", paymentToken: "tok_visa", expectedTotalCents: totalCents },
        key,
      ).expect(201);

      expect(retry.body.order.id).toBe(first.body.order.id);
      expect(await count("orders", customer.id)).toBe(1);
      expect(await count("payments", customer.id)).toBe(1);
    });

    it("replays a decline for the same key and refuses the key for a different request", async () => {
      const customer = await newCustomer();
      const key = randomUUID();

      const declined = await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "tok_expired_card" },
        402,
        key,
      );
      const replayed = await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "tok_expired_card" },
        402,
        key,
      );
      expect(replayed.body.paymentId).toBe(declined.body.paymentId);

      const reused = await checkout(
        customer.token,
        { orderType: "TAKEAWAY", paymentToken: "tok_visa" },
        409,
        key,
      );
      expect(reused.body).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
      expect(await count("orders", customer.id)).toBe(0);
    });

    it("places one order when the customer submits several checkouts at once", async () => {
      const customer = await newCustomer();
      const { totalCents } = await quote(customer.token);
      const body = {
        orderType: "TAKEAWAY",
        method: "CARD",
        paymentToken: "tok_visa",
        expectedTotalCents: totalCents,
      };

      const responses = await Promise.all(
        Array.from({ length: 6 }, () => post(customer.token, body)),
      );
      const statuses = responses.map((response) => response.status);

      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      for (const response of responses.filter((entry) => entry.status !== 201)) {
        expect(response.status).toBe(409);
        expect(["PAYMENT_IN_PROGRESS", "PAYMENT_AWAITING_ORDER", "CART_EMPTY"]).toContain(
          response.body.code,
        );
      }
      expect(await count("orders", customer.id)).toBe(1);
      expect(await count("payments", customer.id)).toBe(1);
    });

    it("places one order when the same checkout is retried concurrently", async () => {
      const customer = await newCustomer();
      const { totalCents } = await quote(customer.token);
      const key = randomUUID();
      const body = {
        orderType: "TAKEAWAY",
        method: "CARD",
        paymentToken: "tok_visa",
        expectedTotalCents: totalCents,
      };

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => post(customer.token, body, key)),
      );
      const placed = responses.filter((response) => response.status === 201);

      expect(placed.length).toBeGreaterThanOrEqual(1);
      expect(new Set(placed.map((response) => response.body.order.id)).size).toBe(1);
      for (const response of responses.filter((entry) => entry.status !== 201)) {
        expect(response.body).toMatchObject({ code: "PAYMENT_IN_PROGRESS" });
      }
      expect(await count("orders", customer.id)).toBe(1);
      expect(await count("payments", customer.id)).toBe(1);
    });

    it("keeps orders consistent while other customers register and shop concurrently", async () => {
      const buyers = await Promise.all(
        Array.from({ length: 4 }, () => newCustomer({ "craft-beer": 1 })),
      );
      const totals = await Promise.all(buyers.map((buyer) => quote(buyer.token)));

      const responses = await Promise.all([
        ...buyers.map((buyer, index) =>
          post(buyer.token, {
            orderType: "TAKEAWAY",
            method: "CARD",
            paymentToken: "tok_visa",
            expectedTotalCents: totals[index].totalCents,
          }),
        ),
        ...Array.from({ length: 4 }, () => newCustomer({ "gelato-trio": 2 })),
      ]);

      expect(
        responses
          .slice(0, buyers.length)
          .every((response) => (response as { status: number }).status === 201),
      ).toBe(true);
      for (const buyer of buyers) {
        expect(await count("orders", buyer.id)).toBe(1);
        const [{ linked }] = await dataSource.query(
          `SELECT COUNT(*) AS linked FROM "payments" WHERE "customer_id" = ? AND "status" = 'SUCCEEDED' AND "order_id" IS NOT NULL`,
          [buyer.id],
        );
        expect(linked).toBe(1);
      }
    });
  });

  describe("customer panel", () => {
    it("lists my orders newest first with pagination", async () => {
      const customer = await newCustomer({ "gelato-trio": 1 });
      const first = await checkout(customer.token, { orderType: "TAKEAWAY" }, 201);
      await fillCart(customer.token, { "smash-burger": 1, "craft-beer": 2 });
      await setTable("T4", { status: "FREE" });
      const second = await checkout(
        customer.token,
        { orderType: "DINE_IN", tableId: tables.T4 },
        201,
      );

      const page = ordersResponseSchema.parse(
        (
          await request(server())
            .get("/api/v1/orders?pageSize=1")
            .set(bearer(customer.token))
            .expect(200)
        ).body,
      );
      expect(page.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
      expect(page.orders[0]).toEqual({
        id: second.body.order.id,
        orderNo: second.body.order.orderNo,
        type: "DINE_IN",
        status: "SENT",
        table: { id: tables.T4, label: "T4" },
        pickupCode: null,
        itemCount: 3,
        totalCents: second.body.order.totalCents,
        createdAt: expect.any(String),
      });

      const next = ordersResponseSchema.parse(
        (
          await request(server())
            .get("/api/v1/orders?page=2&pageSize=1")
            .set(bearer(customer.token))
            .expect(200)
        ).body,
      );
      expect(next.orders.map((order) => order.id)).toEqual([first.body.order.id]);
    });

    it("shows order details to their owner only", async () => {
      const customer = await newCustomer();
      const placed = await checkout(customer.token, { orderType: "TAKEAWAY", tipCents: 150 }, 201);

      const detail = orderResponseSchema.parse(
        (
          await request(server())
            .get(`/api/v1/orders/${placed.body.order.id}`)
            .set(bearer(customer.token))
            .expect(200)
        ).body,
      );
      expect(detail).toEqual(placed.body);
      expect(detail.order.items.reduce((sum, item) => sum + item.lineTotalCents, 0)).toBe(
        detail.order.subtotalCents,
      );

      const other = await newCustomer({});
      const hidden = await request(server())
        .get(`/api/v1/orders/${placed.body.order.id}`)
        .set(bearer(other.token))
        .expect(404);
      expect(hidden.body).toMatchObject({ code: "ORDER_NOT_FOUND" });
      expect(
        (await request(server()).get("/api/v1/orders").set(bearer(other.token)).expect(200)).body
          .orders,
      ).toEqual([]);
      await request(server()).get("/api/v1/orders/abc").set(bearer(other.token)).expect(400);
    });

    it("keeps the order as paid after menu changes", async () => {
      const customer = await newCustomer({ "margherita-pizza": 1 });
      const placed = await checkout(customer.token, { orderType: "TAKEAWAY" }, 201);

      await dataSource.query(
        `UPDATE "menu_items" SET "name" = 'Renamed pizza', "price_cents" = 9999 WHERE "id" = ?`,
        [items["margherita-pizza"]],
      );
      try {
        const detail = (
          await request(server())
            .get(`/api/v1/orders/${placed.body.order.id}`)
            .set(bearer(customer.token))
            .expect(200)
        ).body.order;
        expect(detail.items[0]).toMatchObject({
          name: "Margherita pizza",
          unitPriceCents: prices["margherita-pizza"],
        });
      } finally {
        await dataSource.query(
          `UPDATE "menu_items" SET "name" = 'Margherita pizza', "price_cents" = ? WHERE "id" = ?`,
          [prices["margherita-pizza"], items["margherita-pizza"]],
        );
      }
    });
  });

  describe("recovery after a restart mid-checkout", () => {
    it("fails payments interrupted before the charge finished, so the customer can order", async () => {
      const customer = await newCustomer({ "gelato-trio": 1 });
      const paymentId = await insertInterruptedPayment(customer.id, "PENDING", [
        { slug: "gelato-trio", quantity: 1 },
      ]);

      const blocked = await checkout(customer.token, { orderType: "TAKEAWAY" }, 409);
      expect(blocked.body).toMatchObject({ code: "PAYMENT_IN_PROGRESS", paymentId });

      await app.get(OrdersService).onApplicationBootstrap();
      logs.expectWarning(
        /Recovered interrupted checkouts: 1 payment\(s\) failed, 0 order\(s\) placed/,
      );

      const [payment] = await dataSource.query(
        `SELECT "status", "failure_code" FROM "payments" WHERE "id" = ?`,
        [paymentId],
      );
      expect(payment).toEqual({ status: "FAILED", failure_code: "interrupted" });
      await checkout(customer.token, { orderType: "TAKEAWAY" }, 201);
    });

    it("places the order for a payment that succeeded before the restart, removing only what was paid for", async () => {
      const customer = await newCustomer({ "smash-burger": 3, "house-lemonade": 1 });
      const paymentId = await insertInterruptedPayment(customer.id, "SUCCEEDED", [
        { slug: "smash-burger", quantity: 1 },
      ]);

      const blocked = await checkout(customer.token, { orderType: "TAKEAWAY" }, 409);
      expect(blocked.body).toMatchObject({ code: "PAYMENT_AWAITING_ORDER", paymentId });

      await app.get(OrdersService).onApplicationBootstrap();
      logs.expectWarning(
        /Recovered interrupted checkouts: 0 payment\(s\) failed, 1 order\(s\) placed/,
      );

      const [{ order_id: orderId }] = await dataSource.query(
        `SELECT "order_id" FROM "payments" WHERE "id" = ?`,
        [paymentId],
      );
      expect(orderId).toEqual(expect.any(Number));
      const order = (
        await request(server())
          .get(`/api/v1/orders/${orderId}`)
          .set(bearer(customer.token))
          .expect(200)
      ).body.order;
      expect(order.items.map((item: { quantity: number }) => item.quantity)).toEqual([1]);
      expect(await cartLines(customer.token)).toEqual([
        ["smash-burger", 2],
        ["house-lemonade", 1],
      ]);
    });
  });

  describe("atomic order placement", () => {
    it("waits for another open transaction instead of joining it", async () => {
      const runner = dataSource.createQueryRunner();
      await runner.startTransaction();
      await runner.query(`UPDATE "dining_tables" SET "zone" = 'rolled back' WHERE "label" = 'T8'`);

      let ran = false;
      const pending = runAtomically(dataSource, (db) => {
        ran = true;
        return db.prepare(`UPDATE "dining_tables" SET "seats" = 11 WHERE "label" = 'T8'`).run()
          .changes;
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(ran).toBe(false);

      await runner.rollbackTransaction();
      await runner.release();
      expect(await pending).toBe(1);

      const table = await dataSource.getRepository(DiningTable).findOneByOrFail({ label: "T8" });
      expect(table).toMatchObject({ seats: 11, zone: "Chef's table" });
      await setTable("T8", { seats: 12 });
    });

    it("rolls back everything when any step fails", async () => {
      await expect(
        runAtomically(dataSource, (db) => {
          db.prepare(`UPDATE "dining_tables" SET "seats" = 1 WHERE "label" = 'T8'`).run();
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(
        (await dataSource.getRepository(DiningTable).findOneByOrFail({ label: "T8" })).seats,
      ).toBe(12);
    });
  });

  describe("validation", () => {
    it("requires a valid Idempotency-Key header", async () => {
      const { token } = await newCustomer();
      const body = {
        orderType: "TAKEAWAY",
        method: "CARD",
        paymentToken: "tok_visa",
        expectedTotalCents: 1,
      };

      const missing = await post(token, body, null).expect(400);
      expect(missing.body).toMatchObject({
        code: "VALIDATION_ERROR",
        details: [{ message: "The Idempotency-Key header is required" }],
      });
      await post(token, body, "bad key!").expect(400);
    });

    it.each([
      ["dine-in without a table", { orderType: "DINE_IN" }],
      ["takeaway with a table", { orderType: "TAKEAWAY", tableId: 1 }],
      ["an unknown delivery mode", { orderType: "DELIVERY" }],
      ["cash", { orderType: "TAKEAWAY", method: "CASH" }],
      ["no payment token", { orderType: "TAKEAWAY", paymentToken: undefined }],
      ["a client-set amount", { orderType: "TAKEAWAY", amountCents: 1 }],
      ["a negative tip", { orderType: "TAKEAWAY", tipCents: -100 }],
    ])("rejects a checkout with %s", async (_label, overrides) => {
      const { token, id } = await newCustomer();
      const response = await post(token, {
        method: "CARD",
        paymentToken: "tok_visa",
        expectedTotalCents: 3209,
        ...overrides,
      }).expect(400);

      expect(apiErrorSchema.parse(response.body)).toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
      expect(await count("payments", id)).toBe(0);
    });

    it("rejects bad list queries", async () => {
      const { token } = await newCustomer({});
      await request(server()).get("/api/v1/orders?pageSize=0").set(bearer(token)).expect(400);
      await request(server()).get("/api/v1/orders?status=open").set(bearer(token)).expect(400);
    });
  });
});
