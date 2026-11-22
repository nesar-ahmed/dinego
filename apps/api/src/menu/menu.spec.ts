import { menuItemsQuerySchema, menuQuerySchema } from "@dinego/shared";
import { describe, expect, it } from "vitest";
import { MenuCategory } from "./entities/menu-category.entity.js";
import { MenuItem } from "./entities/menu-item.entity.js";
import { toPublicItem } from "./menu.mapper.js";
import { escapeLike } from "./menu.service.js";

function issues(input: Record<string, unknown>) {
  const result = menuItemsQuerySchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("menu query schemas", () => {
  it("applies defaults", () => {
    expect(menuItemsQuerySchema.parse({})).toEqual({ sort: "recommended", page: 1, pageSize: 20 });
    expect(menuQuerySchema.parse({})).toEqual({ sort: "recommended" });
  });

  it("accepts comma-separated and repeated list params, normalizing tags and slugs", () => {
    expect(menuItemsQuerySchema.parse({ tags: "vegan,gluten-free" }).tags).toEqual([
      "VEGAN",
      "GLUTEN_FREE",
    ]);
    expect(menuItemsQuerySchema.parse({ tags: ["VEGETARIAN", "spicy"] }).tags).toEqual([
      "VEGETARIAN",
      "SPICY",
    ]);
    expect(menuItemsQuerySchema.parse({ category: "Mains, desserts" }).category).toEqual([
      "mains",
      "desserts",
    ]);
  });

  it("treats empty search and list params as absent", () => {
    const parsed = menuItemsQuerySchema.parse({ q: "   ", tags: "", category: "," });
    expect(parsed.q).toBeUndefined();
    expect(parsed.tags).toBeUndefined();
    expect(parsed.category).toBeUndefined();
  });

  it("parses numbers and booleans strictly instead of coercing", () => {
    expect(menuItemsQuerySchema.parse({ minPrice: "0", maxPrice: "1500" })).toMatchObject({
      minPrice: 0,
      maxPrice: 1500,
    });
    expect(menuItemsQuerySchema.parse({ featured: "false" }).featured).toBe(false);
    expect(issues({ minPrice: "" })).toEqual(["minPrice"]);
    expect(issues({ minPrice: "5.5" })).toEqual(["minPrice"]);
    expect(issues({ minPrice: "-1" })).toEqual(["minPrice"]);
    expect(issues({ featured: "1" })).toEqual(["featured"]);
  });

  it("rejects invalid values and unknown parameters", () => {
    expect(issues({ minPrice: "900", maxPrice: "100" })).toEqual(["minPrice"]);
    expect(issues({ sort: "cheapest" })).toEqual(["sort"]);
    expect(issues({ tags: "keto" })).toEqual(["tags.0"]);
    expect(issues({ category: "bad slug!" })).toEqual(["category.0"]);
    expect(issues({ pageSize: "101" })).toEqual(["pageSize"]);
    expect(issues({ page: "0" })).toEqual(["page"]);
    expect(issues({ sortBy: "price" })).toEqual([""]);
  });

  it("does not accept pagination on the grouped menu", () => {
    expect(menuQuerySchema.safeParse({ page: "1" }).success).toBe(false);
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLike("100%_off\\")).toBe("100\\%\\_off\\\\");
    expect(escapeLike("burger")).toBe("burger");
  });
});

describe("toPublicItem", () => {
  it("omits internal kitchen and tax fields", () => {
    const category = Object.assign(new MenuCategory(), { id: 2, slug: "mains", name: "Mains" });
    const item = Object.assign(new MenuItem(), {
      id: 5,
      categoryId: 2,
      category,
      slug: "smash-burger",
      name: "Smash burger",
      description: null,
      priceCents: 1290,
      taxRate: 8.875,
      station: "GRILL",
      allergens: ["gluten"],
      dietaryTags: [],
      featured: true,
      available: true,
      sortOrder: 10,
    });

    const result = toPublicItem(item);

    expect(result).toEqual({
      id: 5,
      slug: "smash-burger",
      name: "Smash burger",
      description: null,
      priceCents: 1290,
      dietaryTags: [],
      allergens: ["gluten"],
      featured: true,
      available: true,
      category: { id: 2, slug: "mains", name: "Mains" },
    });
    expect(result).not.toHaveProperty("station");
    expect(result).not.toHaveProperty("taxRate");
  });
});
