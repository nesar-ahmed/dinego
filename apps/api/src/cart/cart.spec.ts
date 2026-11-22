import {
  addCartItemSchema,
  CART_MAX_ITEM_QUANTITY,
  cartItemParamSchema,
  updateCartItemSchema,
} from "@dinego/shared";
import { describe, expect, it } from "vitest";

describe("cart request schemas", () => {
  it("defaults the added quantity to 1 and rejects unknown fields", () => {
    expect(addCartItemSchema.parse({ menuItemId: 5 })).toEqual({ menuItemId: 5, quantity: 1 });
    expect(addCartItemSchema.safeParse({ menuItemId: 5, price: 1 }).success).toBe(false);
  });

  it("requires a positive whole quantity within the limit when adding", () => {
    for (const quantity of [0, -1, 1.5, CART_MAX_ITEM_QUANTITY + 1, "2"]) {
      expect(addCartItemSchema.safeParse({ menuItemId: 5, quantity }).success).toBe(false);
    }
    expect(
      addCartItemSchema.parse({ menuItemId: 5, quantity: CART_MAX_ITEM_QUANTITY }).quantity,
    ).toBe(CART_MAX_ITEM_QUANTITY);
  });

  it("allows 0 when changing a quantity, meaning remove", () => {
    expect(updateCartItemSchema.parse({ quantity: 0 })).toEqual({ quantity: 0 });
    expect(updateCartItemSchema.safeParse({}).success).toBe(false);
    expect(updateCartItemSchema.safeParse({ quantity: CART_MAX_ITEM_QUANTITY + 1 }).success).toBe(
      false,
    );
  });

  it("parses the menu item id route parameter strictly", () => {
    expect(cartItemParamSchema.parse("12")).toBe(12);
    for (const value of ["0", "-1", "1.5", "abc", "", "1e3"]) {
      expect(cartItemParamSchema.safeParse(value).success).toBe(false);
    }
  });
});
