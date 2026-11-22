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
  notificationReadResponseSchema,
  notificationsResponseSchema,
  orderResponseSchema,
  type NotificationItem,
  type UserRole,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedMenu } from "../src/database/seeds/menu.seed.js";
import { seedTables } from "../src/database/seeds/tables.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { MenuItem } from "../src/menu/entities/menu-item.entity.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { DiningTable } from "../src/tables/entities/dining-table.entity.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

type StaffRole = Exclude<UserRole, "CUSTOMER">;
const STAFF_ROLES: StaffRole[] = ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN"];
const account = (role: UserRole) => userAccounts.find((entry) => entry.role === role)!;

describe("Checkout and payment notifications (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const items: Record<string, number> = {};
  const prices: Record<string, number> = {};
  const tables: Record<string, number> = {};
  const staff = {} as Record<StaffRole, string>;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  let counter = 0;
  /** A fresh customer with a cart: 2 smash burgers ($12.90) and a house lemonade ($3.50). */
  const newCustomer = async (
    cart: Record<string, number> = { "smash-burger": 2, "house-lemonade": 1 },
  ) => {
    counter += 1;
    const response = await request(server())
      .post("/api/v1/users/register")
      .send({
        name: `Checkout Customer ${counter}`,
        email: `checkout-notify-${counter}-${Date.now()}@dinego.com`,
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

  const quoteTotal = async (token: string) =>
    checkoutQuoteResponseSchema.parse(
      (await request(server()).get("/api/v1/payments/quote").set(bearer(token)).expect(200)).body,
    ).quote.totalCents;

  const checkout = async (token: string, body: object, status: number, key = randomUUID()) =>
    request(server())
      .post("/api/v1/orders")
      .set(bearer(token))
      .set("Idempotency-Key", key)
      .send({
        method: "CARD",
        paymentToken: "tok_visa",
        expectedTotalCents: await quoteTotal(token),
        ...body,
      })
      .expect(status);

  const inbox = async (token: string, query = "?pageSize=50") =>
    notificationsResponseSchema.parse(
      (await request(server()).get(`/api/v1/notifications${query}`).set(bearer(token)).expect(200))
        .body,
    );
  const aboutOrder = (notifications: NotificationItem[], orderId: number) =>
    notifications.filter((item) => item.entityType === "ORDER" && item.entityId === orderId);
  const staffAbout = async (role: StaffRole, orderId: number) =>
    aboutOrder((await inbox(staff[role])).notifications, orderId);
  const ofType = async (token: string, type: string) =>
    (await inbox(token)).notifications.filter((item) => item.type === type);

  /** A payment left behind by a crash, as the API would have stored it. */
  const insertInterruptedPayment = async (
    customerId: number,
    status: "PENDING" | "SUCCEEDED",
    slug: string,
  ) => {
    const snapshot = [
      {
        menuItemId: items[slug],
        name: slug,
        quantity: 1,
        unitPriceCents: prices[slug],
        taxRate: 0,
        station: "OTHER",
        lineTotalCents: prices[slug],
        taxCents: 0,
      },
    ];
    const [{ id }] = await dataSource.query(
      `INSERT INTO "payments" ("customer_id", "order_type", "method", "subtotal_cents",
         "tax_cents", "tip_cents", "amount_cents", "lines", "status", "provider", "provider_ref",
         "idempotency_key", "request_hash")
       VALUES (?, 'TAKEAWAY', 'CARD', ?, 0, 0, ?, ?, ?, 'simulated', ?, ?, 'crash')
       RETURNING "id"`,
      [
        customerId,
        prices[slug],
        prices[slug],
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
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-checkout-notifications-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");

    dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
      await seedMenu(manager);
      await seedTables(manager);
    });

    for (const item of await dataSource.getRepository(MenuItem).find()) {
      items[item.slug] = item.id;
      prices[item.slug] = item.priceCents;
    }
    for (const table of await dataSource.getRepository(DiningTable).find()) {
      tables[table.label] = table.id;
    }

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

  describe("order placed", () => {
    it("confirms a dine-in order to the customer and alerts the dine-in staff", async () => {
      const customer = await newCustomer();
      const { order } = orderResponseSchema.parse(
        (await checkout(customer.token, { orderType: "DINE_IN", tableId: tables.T2 }, 201)).body,
      );

      const [placed] = await ofType(customer.token, "ORDER_PLACED");
      expect(placed).toMatchObject({
        type: "ORDER_PLACED",
        category: "ORDER",
        priority: "NORMAL",
        title: `Order ${order.orderNo} is with the kitchen`,
        body: "Table T2 · 3 items · $29.30, paid by card. We'll bring it to your table.",
        link: `/account/orders/${order.id}`,
        entityType: "ORDER",
        entityId: order.id,
        read: false,
      });
      expect(placed.data).toMatchObject({
        orderNo: order.orderNo,
        orderType: "DINE_IN",
        tableLabel: "T2",
      });

      for (const role of ["ADMIN", "MANAGER", "WAITER", "KITCHEN"] as const) {
        const received = await staffAbout(role, order.id);
        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({
          type: "ORDER_RECEIVED",
          priority: "HIGH",
          title: `New dine-in order ${order.orderNo}`,
          body: "Table T2 · 3 items · $29.30. Sent to the kitchen; the table is now occupied.",
          link: null,
        });
      }
      expect(await staffAbout("CASHIER", order.id)).toEqual([]);
    });

    it("does not say the table was seated when the party orders again", async () => {
      const first = await newCustomer({ "gelato-trio": 1 });
      await checkout(first.token, { orderType: "DINE_IN", tableId: tables.T3 }, 201);
      const second = await newCustomer({ "gelato-trio": 1 });
      const { order } = orderResponseSchema.parse(
        (await checkout(second.token, { orderType: "DINE_IN", tableId: tables.T3 }, 201)).body,
      );

      const [received] = await staffAbout("WAITER", order.id);
      expect(received.body).toBe("Table T3 · 1 item · $5.90. Sent to the kitchen.");
    });

    it("gives the takeaway customer the pickup code and alerts the takeaway staff", async () => {
      const customer = await newCustomer();
      const { order } = orderResponseSchema.parse(
        (
          await checkout(
            customer.token,
            { orderType: "TAKEAWAY", method: "ONLINE", paymentToken: "tok_wallet" },
            201,
          )
        ).body,
      );
      expect(order.pickupCode).toMatch(/^\d{4}$/);

      const [placed] = await ofType(customer.token, "ORDER_PLACED");
      expect(placed).toMatchObject({
        title: `Order ${order.orderNo} is placed`,
        body: `3 items · $29.30, paid online. Your pickup code is ${order.pickupCode}: show it when you collect your order.`,
        link: `/account/orders/${order.id}`,
      });

      for (const role of ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"] as const) {
        const [received] = await staffAbout(role, order.id);
        expect(received).toMatchObject({
          title: `New takeaway order ${order.orderNo}`,
          body: `3 items · $29.30 · pickup code ${order.pickupCode}. Waiting to be accepted.`,
        });
      }
      expect(await staffAbout("WAITER", order.id)).toEqual([]);
    });

    it("works with the notifications API: filter, click to read, and the badge", async () => {
      const customer = await newCustomer({ espresso: 2 });
      const { order } = orderResponseSchema.parse(
        (await checkout(customer.token, { orderType: "TAKEAWAY" }, 201)).body,
      );

      const orders = await inbox(customer.token, "?category=ORDER");
      expect(orders.notifications.map((item) => item.type)).toEqual(["ORDER_PLACED"]);
      // The welcome and the order are both unread.
      expect(orders.unreadCount).toBe(2);

      const clicked = notificationReadResponseSchema.parse(
        (
          await request(server())
            .patch(`/api/v1/notifications/${orders.notifications[0].id}/read`)
            .set(bearer(customer.token))
            .expect(200)
        ).body,
      );
      expect(clicked).toMatchObject({ notification: { read: true }, unreadCount: 1 });

      // Staff read theirs the same way; reading it does not touch anyone else's copy.
      const [kitchenCopy] = await staffAbout("KITCHEN", order.id);
      await request(server())
        .patch(`/api/v1/notifications/${kitchenCopy.id}/read`)
        .set(bearer(staff.KITCHEN))
        .expect(200);
      const [managerCopy] = await staffAbout("MANAGER", order.id);
      expect(managerCopy.read).toBe(false);
    });
  });

  describe("payments that do not become orders", () => {
    it("notifies nobody about a declined card, and once about the successful retry", async () => {
      const customer = await newCustomer();
      const before = (await inbox(staff.ADMIN)).pagination.total;

      await checkout(customer.token, { orderType: "TAKEAWAY", paymentToken: "tok_declined" }, 402);
      expect(await ofType(customer.token, "ORDER_PLACED")).toEqual([]);
      expect((await inbox(staff.ADMIN)).pagination.total).toBe(before);

      const { order } = orderResponseSchema.parse(
        (await checkout(customer.token, { orderType: "TAKEAWAY" }, 201)).body,
      );
      expect(await ofType(customer.token, "ORDER_PLACED")).toHaveLength(1);
      expect(await staffAbout("ADMIN", order.id)).toHaveLength(1);
    });

    it("notifies once when a checkout is retried or submitted twice at the same moment", async () => {
      const customer = await newCustomer();
      const key = randomUUID();
      const retry = {
        orderType: "TAKEAWAY",
        method: "CARD",
        paymentToken: "tok_visa",
        expectedTotalCents: await quoteTotal(customer.token),
      };
      // A network retry resends the very same request with the same key.
      const send = () =>
        request(server())
          .post("/api/v1/orders")
          .set(bearer(customer.token))
          .set("Idempotency-Key", key)
          .send(retry)
          .expect(201);
      const first = await send();
      expect((await send()).body.order.id).toBe(first.body.order.id);
      expect(await ofType(customer.token, "ORDER_PLACED")).toHaveLength(1);
      expect(await staffAbout("KITCHEN", first.body.order.id)).toHaveLength(1);

      const racer = await newCustomer();
      const total = await quoteTotal(racer.token);
      const responses = await Promise.all(
        [randomUUID(), randomUUID(), randomUUID()].map((attempt) =>
          request(server())
            .post("/api/v1/orders")
            .set(bearer(racer.token))
            .set("Idempotency-Key", attempt)
            .send({
              orderType: "TAKEAWAY",
              method: "CARD",
              paymentToken: "tok_visa",
              expectedTotalCents: total,
            }),
        ),
      );
      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      expect(await ofType(racer.token, "ORDER_PLACED")).toHaveLength(1);
    });

    it("alerts ADMIN and MANAGER about a provider outage, at most once an hour", async () => {
      const customer = await newCustomer();
      const hourBefore = new Date().toISOString().slice(0, 13);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const outage = await checkout(
          customer.token,
          { orderType: "TAKEAWAY", paymentToken: "tok_provider_error" },
          502,
        );
        logs.expectError(
          new RegExp(
            `Payment ${outage.body.paymentId} not charged: payment provider "simulated" is unavailable`,
          ),
        );
      }
      const hours = new Set([hourBefore, new Date().toISOString().slice(0, 13)]).size;

      for (const role of ["ADMIN", "MANAGER"] as const) {
        const alerts = await ofType(staff[role], "PAYMENT_PROVIDER_OUTAGE");
        expect(alerts).toHaveLength(hours);
        expect(alerts[0]).toMatchObject({
          category: "PAYMENT",
          priority: "HIGH",
          title: "Payments are failing",
          link: null,
          data: { provider: "simulated", reason: "unavailable" },
        });
      }
      for (const role of ["WAITER", "CASHIER", "KITCHEN"] as const) {
        expect(await ofType(staff[role], "PAYMENT_PROVIDER_OUTAGE")).toEqual([]);
      }
      // The customer is told by the 502 on the checkout page, not by a notification.
      expect((await inbox(customer.token)).notifications.map((item) => item.type)).toEqual([
        "CUSTOMER_WELCOME",
      ]);
    });
  });

  describe("recovery after a restart mid-checkout", () => {
    it("tells the customer an interrupted checkout charged nothing, once", async () => {
      const customer = await newCustomer({ "gelato-trio": 1 });
      const paymentId = await insertInterruptedPayment(customer.id, "PENDING", "gelato-trio");

      await app.get(OrdersService).onApplicationBootstrap();
      logs.expectWarning(
        /Recovered interrupted checkouts: 1 payment\(s\) failed, 0 order\(s\) placed/,
      );

      const interrupted = await ofType(customer.token, "CHECKOUT_INTERRUPTED");
      expect(interrupted).toHaveLength(1);
      expect(interrupted[0]).toMatchObject({
        category: "PAYMENT",
        priority: "HIGH",
        title: "Your checkout didn't finish",
        body: "Your takeaway checkout of $5.90 was interrupted. You were not charged and no order was placed. Your cart is unchanged, so you can check out again.",
        link: "/checkout",
        entityType: "PAYMENT",
        entityId: paymentId,
      });

      // Another restart finds nothing left to recover and notifies nobody again.
      await app.get(OrdersService).onApplicationBootstrap();
      expect(await ofType(customer.token, "CHECKOUT_INTERRUPTED")).toHaveLength(1);
    });

    it("notifies about an order placed for a payment that succeeded before the restart", async () => {
      const customer = await newCustomer({ espresso: 1 });
      const paymentId = await insertInterruptedPayment(customer.id, "SUCCEEDED", "espresso");

      await app.get(OrdersService).onApplicationBootstrap();
      logs.expectWarning(
        /Recovered interrupted checkouts: 0 payment\(s\) failed, 1 order\(s\) placed/,
      );

      const [{ order_id: orderId }] = await dataSource.query(
        `SELECT "order_id" FROM "payments" WHERE "id" = ?`,
        [paymentId],
      );
      const [placed] = await ofType(customer.token, "ORDER_PLACED");
      expect(placed).toMatchObject({ entityId: orderId, link: `/account/orders/${orderId}` });
      expect(placed.body).toMatch(/^1 item · \$3\.00, paid by card\. Your pickup code is \d{4}/);
      expect(await staffAbout("CASHIER", orderId)).toHaveLength(1);
    });
  });

  describe("safety", () => {
    it("never blocks a paid order when notifications cannot be written", async () => {
      const customer = await newCustomer();
      await dataSource.query(
        `CREATE TRIGGER "test_block_notifications" BEFORE INSERT ON "notifications"
         BEGIN SELECT RAISE(ABORT, 'notifications are broken'); END`,
      );

      try {
        const { order } = orderResponseSchema.parse(
          (await checkout(customer.token, { orderType: "TAKEAWAY" }, 201)).body,
        );
        logs.expectError(
          /Could not create ORDER_PLACED, ORDER_RECEIVED notification\(s\); the triggering change was kept/,
        );

        // The order, its payment, and the emptied cart are all there.
        const [payment] = await dataSource.query(
          `SELECT "status", "order_id" FROM "payments" WHERE "customer_id" = ?`,
          [customer.id],
        );
        expect(payment).toEqual({ status: "SUCCEEDED", order_id: order.id });
        expect(
          (await request(server()).get("/api/v1/cart").set(bearer(customer.token)).expect(200)).body
            .cart.items,
        ).toEqual([]);
        expect(await ofType(customer.token, "ORDER_PLACED")).toEqual([]);
      } finally {
        await dataSource.query(`DROP TRIGGER "test_block_notifications"`);
      }
    });
  });
});
