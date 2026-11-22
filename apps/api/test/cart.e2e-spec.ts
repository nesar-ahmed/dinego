import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  CART_MAX_ITEM_QUANTITY,
  CART_MAX_LINES,
  cartResponseSchema,
  type CartResponse,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedMenu } from "../src/database/seeds/menu.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { MenuCategory } from "../src/menu/entities/menu-category.entity.js";
import { MenuItem } from "../src/menu/entities/menu-item.entity.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const admin = userAccounts.find((account) => account.role === "ADMIN")!;
const seededCustomer = userAccounts.find((account) => account.role === "CUSTOMER")!;

describe("Cart API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const ids: Record<string, number> = {};

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Registers a fresh customer so each test owns an isolated cart. */
  let customerCounter = 0;
  const newCustomer = async () => {
    customerCounter += 1;
    const response = await request(server())
      .post("/api/v1/users/register")
      .send({
        name: `Cart Customer ${customerCounter}`,
        email: `cart-${customerCounter}-${Date.now()}@dinego.com`,
        password: "Password123!",
      })
      .expect(201);
    return { token: response.body.accessToken as string, id: response.body.customer.id as number };
  };

  const getCart = async (token: string) =>
    cartResponseSchema.parse(
      (await request(server()).get("/api/v1/cart").set(bearer(token)).expect(200)).body,
    );
  const add = (token: string, body: object) =>
    request(server()).post("/api/v1/cart/items").set(bearer(token)).send(body);
  const patch = (token: string, menuItemId: number | string, body: object) =>
    request(server()).patch(`/api/v1/cart/items/${menuItemId}`).set(bearer(token)).send(body);
  const remove = (token: string, menuItemId: number | string) =>
    request(server()).delete(`/api/v1/cart/items/${menuItemId}`).set(bearer(token));
  const lines = (body: CartResponse) =>
    body.cart.items.map((line) => [line.item.slug, line.quantity, line.purchasable] as const);

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-cart-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");

    dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
      await seedMenu(manager);

      const categories = manager.getRepository(MenuCategory);
      const items = manager.getRepository(MenuItem);
      const hidden = await categories.save(
        categories.create({ slug: "off-menu", name: "Off menu", active: false }),
      );
      await items.save(
        items.create({
          categoryId: hidden.id,
          slug: "secret-dish",
          name: "Secret dish",
          priceCents: 100,
        }),
      );
      await items.update({ slug: "espresso" }, { available: false });

      // Enough items to exceed the distinct-line limit.
      const bulk = await categories.save(
        categories.create({ slug: "bulk", name: "Bulk", sortOrder: 99 }),
      );
      await items.save(
        Array.from({ length: CART_MAX_LINES + 1 }, (_, index) =>
          items.create({
            categoryId: bulk.id,
            slug: `bulk-${index}`,
            name: `Bulk ${index}`,
            priceCents: 100,
          }),
        ),
      );
    });

    for (const item of await dataSource.getRepository(MenuItem).find()) {
      ids[item.slug] = item.id;
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
    it("requires a signed-in customer", async () => {
      await request(server()).get("/api/v1/cart").expect(401);

      const staffLogin = await request(server())
        .post("/api/v1/users/staff/login")
        .send({ email: admin.email, password: admin.password })
        .expect(200);
      const forbidden = await request(server())
        .get("/api/v1/cart")
        .set(bearer(staffLogin.body.accessToken))
        .expect(403);
      expect(forbidden.body).toMatchObject({ statusCode: 403, code: "CUSTOMER_ONLY" });
    });

    it("rejects a valid token for a deactivated customer", async () => {
      const customer = await newCustomer();
      await dataSource.query(`UPDATE "users" SET "active" = 0 WHERE "id" = ?`, [customer.id]);

      await request(server()).get("/api/v1/cart").set(bearer(customer.token)).expect(401);
      await add(customer.token, { menuItemId: ids["smash-burger"] }).expect(401);
    });

    it("works with the HttpOnly session cookie", async () => {
      const agent = request.agent(server());
      await agent
        .post("/api/v1/users/login")
        .send({ email: seededCustomer.email, password: seededCustomer.password })
        .expect(200);

      const added = await agent
        .post("/api/v1/cart/items")
        .send({ menuItemId: ids["gelato-trio"] })
        .expect(200);
      expect(added.body.cart.itemCount).toBe(1);
      await agent.delete(`/api/v1/cart/items/${ids["gelato-trio"]}`).expect(200);
    });

    it("keeps every customer's cart separate", async () => {
      const first = await newCustomer();
      const second = await newCustomer();

      await add(first.token, { menuItemId: ids["smash-burger"] }).expect(200);

      expect((await getCart(second.token)).cart.items).toEqual([]);
      await patch(second.token, ids["smash-burger"], { quantity: 5 }).expect(404);
      await remove(second.token, ids["smash-burger"]).expect(200);
      expect(lines(await getCart(first.token))).toEqual([["smash-burger", 1, true]]);
    });
  });

  describe("add, change, and remove", () => {
    it("starts empty without creating a cart row", async () => {
      const customer = await newCustomer();

      expect(await getCart(customer.token)).toEqual({
        cart: {
          items: [],
          itemCount: 0,
          subtotalCents: 0,
          hasUnavailableItems: false,
          updatedAt: null,
        },
      });
      const [{ count }] = await dataSource.query(
        `SELECT COUNT(*) AS count FROM "carts" WHERE "customer_id" = ?`,
        [customer.id],
      );
      expect(count).toBe(0);
    });

    it("adds items, merges repeats into one line, and totals with current prices", async () => {
      const { token } = await newCustomer();

      await add(token, { menuItemId: ids["smash-burger"], quantity: 2 }).expect(200);
      await add(token, { menuItemId: ids["house-lemonade"] }).expect(200);
      const response = cartResponseSchema.parse(
        (await add(token, { menuItemId: ids["smash-burger"] }).expect(200)).body,
      );

      expect(lines(response)).toEqual([
        ["smash-burger", 3, true],
        ["house-lemonade", 1, true],
      ]);
      expect(response.cart.items[0]).toMatchObject({ lineTotalCents: 3 * 1290 });
      expect(response.cart.items[0].item).toMatchObject({
        name: "Smash burger",
        priceCents: 1290,
        allergens: ["gluten", "dairy", "egg"],
      });
      expect(response.cart).toMatchObject({
        itemCount: 4,
        subtotalCents: 3 * 1290 + 350,
        hasUnavailableItems: false,
      });
      expect(response.cart.updatedAt).not.toBeNull();

      // Prices are read live, so a menu price change is reflected immediately.
      await dataSource.query(`UPDATE "menu_items" SET "price_cents" = 400 WHERE "id" = ?`, [
        ids["house-lemonade"],
      ]);
      expect((await getCart(token)).cart.subtotalCents).toBe(3 * 1290 + 400);
      await dataSource.query(`UPDATE "menu_items" SET "price_cents" = 350 WHERE "id" = ?`, [
        ids["house-lemonade"],
      ]);
    });

    it("increases and decreases quantity, and 0 removes the item", async () => {
      const { token } = await newCustomer();
      await add(token, { menuItemId: ids["gelato-trio"] }).expect(200);

      expect(
        lines((await patch(token, ids["gelato-trio"], { quantity: 4 }).expect(200)).body),
      ).toEqual([["gelato-trio", 4, true]]);
      expect(
        lines((await patch(token, ids["gelato-trio"], { quantity: 1 }).expect(200)).body),
      ).toEqual([["gelato-trio", 1, true]]);
      expect(
        (await patch(token, ids["gelato-trio"], { quantity: 0 }).expect(200)).body.cart.items,
      ).toEqual([]);

      const missing = await patch(token, ids["gelato-trio"], { quantity: 2 }).expect(404);
      expect(missing.body).toMatchObject({ statusCode: 404, code: "CART_ITEM_NOT_FOUND" });
      await patch(token, ids["gelato-trio"], { quantity: 0 }).expect(404);
    });

    it("removes an item and is idempotent", async () => {
      const { token } = await newCustomer();
      await add(token, { menuItemId: ids["craft-beer"] }).expect(200);
      await add(token, { menuItemId: ids["gelato-trio"] }).expect(200);

      const removed = cartResponseSchema.parse(
        (await remove(token, ids["craft-beer"]).expect(200)).body,
      );
      expect(lines(removed)).toEqual([["gelato-trio", 1, true]]);
      expect(lines((await remove(token, ids["craft-beer"]).expect(200)).body)).toEqual([
        ["gelato-trio", 1, true],
      ]);
    });
  });

  describe("menu rules", () => {
    it("only accepts items that are on the public menu and not sold out", async () => {
      const { token } = await newCustomer();

      const unknown = await add(token, { menuItemId: 999_999 }).expect(404);
      expect(unknown.body).toMatchObject({ statusCode: 404, code: "MENU_ITEM_NOT_FOUND" });

      await add(token, { menuItemId: ids["secret-dish"] }).expect(404);

      const soldOut = await add(token, { menuItemId: ids["espresso"] }).expect(409);
      expect(soldOut.body).toMatchObject({ statusCode: 409, code: "ITEM_UNAVAILABLE" });

      expect((await getCart(token)).cart.items).toEqual([]);
    });

    it("flags items that become unavailable after being added", async () => {
      const { token } = await newCustomer();
      await add(token, { menuItemId: ids["ribeye-steak"], quantity: 2 }).expect(200);
      await add(token, { menuItemId: ids["margherita-pizza"], quantity: 2 }).expect(200);
      await add(token, { menuItemId: ids["craft-beer"] }).expect(200);

      await dataSource.query(`UPDATE "menu_items" SET "available" = 0 WHERE "id" = ?`, [
        ids["ribeye-steak"],
      ]);
      await dataSource.query(`UPDATE "menu_categories" SET "active" = 0 WHERE "slug" = 'drinks'`);

      try {
        const cart = await getCart(token);
        expect(lines(cart)).toEqual([
          ["ribeye-steak", 2, false],
          ["margherita-pizza", 2, true],
          ["craft-beer", 1, false],
        ]);
        expect(cart.cart).toMatchObject({
          itemCount: 2,
          subtotalCents: 2 * 1190,
          hasUnavailableItems: true,
        });

        const increase = await patch(token, ids["ribeye-steak"], { quantity: 3 }).expect(409);
        expect(increase.body).toMatchObject({ statusCode: 409, code: "ITEM_UNAVAILABLE" });
        await add(token, { menuItemId: ids["ribeye-steak"] }).expect(409);

        expect(
          lines((await patch(token, ids["ribeye-steak"], { quantity: 1 }).expect(200)).body)[0],
        ).toEqual(["ribeye-steak", 1, false]);
        await remove(token, ids["craft-beer"]).expect(200);
      } finally {
        await dataSource.query(`UPDATE "menu_items" SET "available" = 1 WHERE "id" = ?`, [
          ids["ribeye-steak"],
        ]);
        await dataSource.query(`UPDATE "menu_categories" SET "active" = 1 WHERE "slug" = 'drinks'`);
      }
    });

    it("caps the quantity of one item", async () => {
      const { token } = await newCustomer();
      await add(token, {
        menuItemId: ids["gelato-trio"],
        quantity: CART_MAX_ITEM_QUANTITY - 1,
      }).expect(200);
      await add(token, { menuItemId: ids["gelato-trio"] }).expect(200);

      const overLimit = await add(token, { menuItemId: ids["gelato-trio"] }).expect(409);
      expect(overLimit.body).toMatchObject({ statusCode: 409, code: "QUANTITY_LIMIT" });
      await patch(token, ids["gelato-trio"], { quantity: CART_MAX_ITEM_QUANTITY + 1 }).expect(400);
      expect((await getCart(token)).cart.items[0].quantity).toBe(CART_MAX_ITEM_QUANTITY);
    });

    it("caps the number of different items", async () => {
      const { token } = await newCustomer();
      for (let index = 0; index < CART_MAX_LINES; index += 1) {
        await add(token, { menuItemId: ids[`bulk-${index}`] }).expect(200);
      }

      const full = await add(token, { menuItemId: ids[`bulk-${CART_MAX_LINES}`] }).expect(409);
      expect(full.body).toMatchObject({ statusCode: 409, code: "CART_FULL" });

      // Items already in the cart can still be increased.
      await add(token, { menuItemId: ids["bulk-0"] }).expect(200);
      expect((await getCart(token)).cart.items).toHaveLength(CART_MAX_LINES);
    });
  });

  describe("concurrency", () => {
    it("applies simultaneous adds atomically and never exceeds the quantity cap", async () => {
      const { token } = await newCustomer();
      const attempts = CART_MAX_ITEM_QUANTITY + 5;

      const responses = await Promise.all(
        Array.from({ length: attempts }, () => add(token, { menuItemId: ids["fish-and-chips"] })),
      );
      const statuses = responses.map((response) => response.status);

      expect(statuses.filter((status) => status === 200)).toHaveLength(CART_MAX_ITEM_QUANTITY);
      expect(statuses.filter((status) => status === 409)).toHaveLength(5);
      expect((await getCart(token)).cart.items).toEqual([
        expect.objectContaining({ quantity: CART_MAX_ITEM_QUANTITY }),
      ]);
    });

    it("handles simultaneous mixed operations without server errors", async () => {
      const { token } = await newCustomer();
      await add(token, { menuItemId: ids["smash-burger"] }).expect(200);

      const responses = await Promise.all([
        add(token, { menuItemId: ids["gelato-trio"] }),
        patch(token, ids["smash-burger"], { quantity: 3 }),
        add(token, { menuItemId: ids["house-lemonade"] }),
        remove(token, ids["gelato-trio"]),
        add(token, { menuItemId: ids["smash-burger"] }),
        request(server()).get("/api/v1/cart").set(bearer(token)),
      ]);

      expect(responses.every((response) => response.status < 500)).toBe(true);
      const cart = await getCart(token);
      expect(cart.cart.items.map((line) => line.item.slug)).toContain("house-lemonade");
    });
  });

  describe("validation", () => {
    it.each([
      ["missing menuItemId", {}],
      ["zero quantity", { menuItemId: 1, quantity: 0 }],
      ["fractional quantity", { menuItemId: 1, quantity: 1.5 }],
      ["string id", { menuItemId: "1" }],
      ["unknown field", { menuItemId: 1, note: "extra" }],
    ])("rejects an add with %s", async (_label, body) => {
      const { token } = await newCustomer();
      const response = await add(token, body).expect(400);

      expect(apiErrorSchema.parse(response.body)).toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("rejects bad ids and quantities on change and remove", async () => {
      const { token } = await newCustomer();

      await patch(token, "abc", { quantity: 1 }).expect(400);
      await patch(token, 0, { quantity: 1 }).expect(400);
      await patch(token, 1, { quantity: -1 }).expect(400);
      await patch(token, 1, {}).expect(400);
      await remove(token, "1.5").expect(400);
    });
  });
});
