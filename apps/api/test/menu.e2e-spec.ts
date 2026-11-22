import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { MenuItemsResponse, MenuResponse, PublicMenuItem } from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { menuCatalog, seedMenu } from "../src/database/seeds/menu.seed.js";
import { MenuCategory } from "../src/menu/entities/menu-category.entity.js";
import { MenuItem } from "../src/menu/entities/menu-item.entity.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

/**
 * Fixtures added on top of the demo seed to cover rules the seed alone cannot:
 * - an inactive category whose item must never be public
 * - a sold-out item
 * - a lowercase name (case-insensitive sorting) and a literal `%` (LIKE escaping)
 * - a price tie with House lemonade (350) to check the stable id tie-break
 */
const HIDDEN_ITEM = "off-menu-special";
const SOLD_OUT_ITEM = "espresso";
const LOWERCASE_ITEM = "iced-tea";
const PERCENT_ITEM = "fresh-orange-juice";

const seededSlugs = menuCatalog.flatMap((category) => category.items.map((item) => item.slug));
const publicSlugsInMenuOrder = [...seededSlugs, LOWERCASE_ITEM, PERCENT_ITEM];

describe("Menu API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1/menu${path}`);
  const slugs = (items: PublicMenuItem[]) => items.map((item) => item.slug);
  const listItems = async (query: string) =>
    (await get(`/items?pageSize=100&${query}`).expect(200)).body as MenuItemsResponse;

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-menu-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");

    const dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();

    try {
      await dataSource.runMigrations();
      await dataSource.transaction(async (manager) => {
        await seedMenu(manager);

        const categories = manager.getRepository(MenuCategory);
        const items = manager.getRepository(MenuItem);
        const drinks = await categories.findOneByOrFail({ slug: "drinks" });
        const hidden = await categories.save(
          categories.create({ slug: "off-menu", name: "Off menu", sortOrder: 5, active: false }),
        );

        await items.save([
          items.create({
            categoryId: hidden.id,
            slug: HIDDEN_ITEM,
            name: "Secret special burger",
            description: "Not on the public menu",
            priceCents: 999,
            featured: true,
          }),
          items.create({
            categoryId: drinks.id,
            slug: LOWERCASE_ITEM,
            name: "iced tea",
            description: "Black tea, lemon",
            priceCents: 350,
            dietaryTags: ["VEGAN", "GLUTEN_FREE"],
            sortOrder: 100,
          }),
          items.create({
            categoryId: drinks.id,
            slug: PERCENT_ITEM,
            name: "Fresh orange juice",
            description: "100% squeezed to order",
            priceCents: 450,
            dietaryTags: ["VEGAN"],
            sortOrder: 110,
          }),
        ]);
        await items.update({ slug: SOLD_OUT_ITEM }, { available: false });
      });
    } finally {
      await dataSource.destroy();
    }

    ({ app, logs } = await createE2eApp());
  });

  afterEach(() => {
    logs.assertNoUnexpectedErrors();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(databaseDir, { recursive: true, force: true });

    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
  });

  describe("visibility", () => {
    it("lists only active categories, in menu order, with public item counts", async () => {
      const response = await get("/categories").expect(200);

      expect(response.body.categories).toEqual([
        {
          id: expect.any(Number),
          slug: "small-plates",
          name: "Small plates",
          description: "Made for the middle of the table.",
          itemCount: 4,
        },
        {
          id: expect.any(Number),
          slug: "mains",
          name: "Mains",
          description: "Comforting plates from our open kitchen.",
          itemCount: 6,
        },
        {
          id: expect.any(Number),
          slug: "desserts",
          name: "Desserts",
          description: "A little something before the last train.",
          itemCount: 3,
        },
        {
          id: expect.any(Number),
          slug: "drinks",
          name: "Drinks",
          description: "Coffee, house pours, and something cold.",
          itemCount: 6,
        },
      ]);
    });

    it("never exposes items from an inactive category", async () => {
      await get(`/items/${HIDDEN_ITEM}`).expect(404);
      expect((await listItems("category=off-menu")).items).toEqual([]);
      expect((await listItems("q=secret")).items).toEqual([]);
      expect(slugs((await listItems("featured=true")).items)).not.toContain(HIDDEN_ITEM);

      const menu = (await get("").expect(200)).body as MenuResponse;
      expect(menu.categories.map((category) => category.slug)).not.toContain("off-menu");
    });

    it("keeps sold-out items listed unless available=true is requested", async () => {
      const all = await listItems("");
      expect(all.items.find((item) => item.slug === SOLD_OUT_ITEM)?.available).toBe(false);

      expect(slugs((await listItems("available=true")).items)).not.toContain(SOLD_OUT_ITEM);
      expect(slugs((await listItems("available=false")).items)).toEqual([SOLD_OUT_ITEM]);
    });

    it("is public and returns only customer-facing fields", async () => {
      const response = await get("/items/smash-burger").expect(200);

      expect(response.body).toEqual({
        item: {
          id: expect.any(Number),
          slug: "smash-burger",
          name: "Smash burger",
          description: "Double patty, aged cheddar, house pickles, brioche",
          priceCents: 1290,
          dietaryTags: [],
          allergens: ["gluten", "dairy", "egg"],
          featured: true,
          available: true,
          category: { id: expect.any(Number), slug: "mains", name: "Mains" },
        },
      });
      await get("/items/no-such-dish").expect(404);
    });
  });

  describe("browse and paginate", () => {
    it("returns every public item in curated menu order by default", async () => {
      const response = await listItems("");

      expect(slugs(response.items)).toEqual(publicSlugsInMenuOrder);
      expect(response.pagination).toEqual({
        page: 1,
        pageSize: 100,
        total: publicSlugsInMenuOrder.length,
        totalPages: 1,
      });
    });

    it("paginates without gaps or duplicates", async () => {
      const pageSize = 5;
      const first = (await get(`/items?pageSize=${pageSize}`).expect(200))
        .body as MenuItemsResponse;
      const totalPages = Math.ceil(publicSlugsInMenuOrder.length / pageSize);
      expect(first.pagination).toEqual({
        page: 1,
        pageSize,
        total: publicSlugsInMenuOrder.length,
        totalPages,
      });

      const collected = [...slugs(first.items)];
      for (let page = 2; page <= totalPages; page += 1) {
        const next = (await get(`/items?pageSize=${pageSize}&page=${page}`).expect(200))
          .body as MenuItemsResponse;
        collected.push(...slugs(next.items));
      }
      expect(collected).toEqual(publicSlugsInMenuOrder);

      const beyond = (await get(`/items?pageSize=${pageSize}&page=${totalPages + 1}`).expect(200))
        .body as MenuItemsResponse;
      expect(beyond.items).toEqual([]);
      expect(beyond.pagination.total).toBe(publicSlugsInMenuOrder.length);
    });

    it("groups the full menu by category and omits categories without matches", async () => {
      const full = (await get("").expect(200)).body as MenuResponse;
      expect(full.categories.map((category) => category.slug)).toEqual([
        "small-plates",
        "mains",
        "desserts",
        "drinks",
      ]);
      expect(full.categories.flatMap((category) => slugs(category.items))).toEqual(
        publicSlugsInMenuOrder,
      );

      const vegan = (await get("?tags=vegan").expect(200)).body as MenuResponse;
      expect(vegan.categories).toHaveLength(1);
      expect(vegan.categories[0]).toMatchObject({ slug: "drinks", itemCount: 6 });
      expect(slugs(vegan.categories[0].items)).toEqual([
        "house-lemonade",
        "espresso",
        "sparkling-water",
        LOWERCASE_ITEM,
        PERCENT_ITEM,
      ]);
    });
  });

  describe("search", () => {
    it("matches name, description, and category name case-insensitively", async () => {
      expect(slugs((await listItems("q=MUSHROOM")).items)).toEqual([
        "wild-mushroom-toast",
        "mushroom-risotto",
      ]);
      expect(slugs((await listItems("q=aioli")).items)).toEqual(["crispy-calamari"]);
      expect(slugs((await listItems("q=desserts")).items)).toEqual([
        "chocolate-lava-cake",
        "new-york-cheesecake",
        "gelato-trio",
      ]);
      expect((await listItems("q=zzz-no-match")).items).toEqual([]);
    });

    it("treats LIKE wildcards in the search term literally", async () => {
      expect(slugs((await listItems("q=%25")).items)).toEqual([PERCENT_ITEM]);
      expect((await listItems("q=_")).items).toEqual([]);
    });
  });

  describe("filters", () => {
    it("filters by any of several categories", async () => {
      const response = await listItems("category=desserts,DRINKS");
      expect(new Set(response.items.map((item) => item.category.slug))).toEqual(
        new Set(["desserts", "drinks"]),
      );
      expect(response.pagination.total).toBe(9);
      expect((await listItems("category=unknown")).items).toEqual([]);
    });

    it("requires every requested dietary tag", async () => {
      expect(slugs((await listItems("tags=vegetarian,gluten-free")).items)).toEqual([
        "charred-corn-ribs",
        "mushroom-risotto",
        "gelato-trio",
      ]);
      expect(slugs((await listItems("tags=SPICY")).items)).toEqual(["crispy-calamari"]);
      expect((await listItems("tags=vegan&tags=spicy")).items).toEqual([]);
    });

    it("applies inclusive price bounds in cents", async () => {
      expect(slugs((await listItems("minPrice=890&maxPrice=890")).items)).toEqual([
        "crispy-calamari",
      ]);

      const range = await listItems("minPrice=1000&maxPrice=1500");
      expect(range.items.every((item) => item.priceCents >= 1000 && item.priceCents <= 1500)).toBe(
        true,
      );
      expect(range.pagination.total).toBe(5);
    });

    it("filters featured items and combines filters", async () => {
      expect(slugs((await listItems("featured=true")).items)).toEqual([
        "crispy-calamari",
        "smash-burger",
        "chocolate-lava-cake",
      ]);
      expect(
        slugs((await listItems("q=tea&category=drinks&tags=vegan&maxPrice=400")).items),
      ).toEqual([LOWERCASE_ITEM]);
    });
  });

  describe("sorting", () => {
    it("sorts by price with a stable tie-break", async () => {
      const ascending = (await listItems("sort=price_asc")).items;
      const prices = ascending.map((item) => item.priceCents);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));

      // House lemonade (seeded first) and iced tea share a price; the lower id comes first.
      const tied = slugs(ascending).filter(
        (slug) => slug === "house-lemonade" || slug === LOWERCASE_ITEM,
      );
      expect(tied).toEqual(["house-lemonade", LOWERCASE_ITEM]);

      const descending = (await listItems("sort=price_desc")).items.map((item) => item.priceCents);
      expect(descending).toEqual([...descending].sort((a, b) => b - a));
    });

    it("sorts by name case-insensitively", async () => {
      const names = (await listItems("sort=name_asc")).items.map((item) => item.name);
      expect(names).toEqual(
        [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      );
      expect(names.indexOf("iced tea")).toBe(names.indexOf("House lemonade") + 1);

      const reversed = (await listItems("sort=name_desc")).items.map((item) => item.name);
      expect(reversed).toEqual([...names].reverse());
    });
  });

  describe("validation", () => {
    it.each([
      ["unknown parameter", "/items?sortBy=price"],
      ["unknown sort", "/items?sort=cheapest"],
      ["unknown dietary tag", "/items?tags=keto"],
      ["inverted price range", "/items?minPrice=2000&maxPrice=1000"],
      ["empty number", "/items?minPrice="],
      ["non-boolean flag", "/items?featured=yes"],
      ["page size too large", "/items?pageSize=101"],
      ["pagination on grouped menu", "?page=2"],
    ])("rejects %s with VALIDATION_ERROR", async (_label, path) => {
      const response = await get(path).expect(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.body.details.length).toBeGreaterThan(0);
    });
  });
});
