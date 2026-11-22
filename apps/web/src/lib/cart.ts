import {
  CART_MAX_ITEM_QUANTITY,
  cartResponseSchema,
  type CustomerCart,
  type PublicMenuItem,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";

/* ------------------------------- API calls ------------------------------- */

async function parseCart(payload: unknown): Promise<CustomerCart> {
  const parsed = cartResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiError("The cart response did not match the shared contract.", 0);
  }

  return parsed.data.cart;
}

export async function fetchCart(): Promise<CustomerCart> {
  return parseCart(await apiRequest<unknown>("/cart"));
}

export async function addCartItem(menuItemId: number, quantity = 1): Promise<CustomerCart> {
  return parseCart(
    await apiRequest<unknown>("/cart/items", { method: "POST", body: { menuItemId, quantity } }),
  );
}

/** Sets an absolute quantity; 0 removes the item. */
export async function setCartItemQuantity(
  menuItemId: number,
  quantity: number,
): Promise<CustomerCart> {
  return parseCart(
    await apiRequest<unknown>(`/cart/items/${menuItemId}`, { method: "PATCH", body: { quantity } }),
  );
}

export async function removeCartItem(menuItemId: number): Promise<CustomerCart> {
  return parseCart(await apiRequest<unknown>(`/cart/items/${menuItemId}`, { method: "DELETE" }));
}

/* ------------------------- Optimistic local updates ------------------------ */

export const EMPTY_CART: CustomerCart = {
  items: [],
  itemCount: 0,
  subtotalCents: 0,
  hasUnavailableItems: false,
  updatedAt: null,
};

/** Recomputes totals the same way the API does, so optimistic state matches the server. */
function withTotals(items: CustomerCart["items"], updatedAt: string | null): CustomerCart {
  const purchasable = items.filter((line) => line.purchasable);

  return {
    items,
    itemCount: purchasable.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents: purchasable.reduce((sum, line) => sum + line.lineTotalCents, 0),
    hasUnavailableItems: purchasable.length !== items.length,
    updatedAt,
  };
}

export function applyAdd(cart: CustomerCart, item: PublicMenuItem): CustomerCart {
  const existing = cart.items.find((line) => line.item.id === item.id);

  if (existing) {
    return applyQuantity(cart, item.id, Math.min(existing.quantity + 1, CART_MAX_ITEM_QUANTITY));
  }

  return withTotals(
    [
      ...cart.items,
      { item, quantity: 1, lineTotalCents: item.priceCents, purchasable: item.available },
    ],
    cart.updatedAt,
  );
}

export function applyQuantity(
  cart: CustomerCart,
  menuItemId: number,
  quantity: number,
): CustomerCart {
  const items =
    quantity <= 0
      ? cart.items.filter((line) => line.item.id !== menuItemId)
      : cart.items.map((line) =>
          line.item.id === menuItemId
            ? { ...line, quantity, lineTotalCents: line.item.priceCents * quantity }
            : line,
        );

  return withTotals(items, cart.updatedAt);
}

/* ---------------------------- Friendly messages ---------------------------- */

export function cartErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "ITEM_UNAVAILABLE":
      case "QUANTITY_LIMIT":
      case "CART_FULL":
        return error.message;
      case "MENU_ITEM_NOT_FOUND":
        return "That dish is no longer on the menu.";
      case "CART_ITEM_NOT_FOUND":
        return "That item was already removed from your cart.";
    }

    if (error.status === 0) {
      return "We couldn't reach the kitchen just now. Please try again.";
    }
  }

  return "Something went wrong updating your cart. Please try again.";
}

/* ------------------------- Add after signing in ------------------------- */

const PENDING_ADD_KEY = "dinego:pending-cart-add";
const PENDING_ADD_TTL_MS = 15 * 60 * 1000;

type PendingAdd = { menuItemId: number; name: string; at: number };

/** Remembers what a signed-out visitor tried to add, so it can be added after login. */
export function savePendingAdd(item: PublicMenuItem): void {
  try {
    const pending: PendingAdd = { menuItemId: item.id, name: item.name, at: Date.now() };
    sessionStorage.setItem(PENDING_ADD_KEY, JSON.stringify(pending));
  } catch {
    // Storage can be unavailable (private mode); the visitor simply adds the item again.
  }
}

/** Returns and clears a recent pending add. */
export function takePendingAdd(): PendingAdd | null {
  try {
    const raw = sessionStorage.getItem(PENDING_ADD_KEY);
    sessionStorage.removeItem(PENDING_ADD_KEY);

    if (!raw) return null;

    const pending = JSON.parse(raw) as Partial<PendingAdd>;
    const fresh = typeof pending.at === "number" && Date.now() - pending.at < PENDING_ADD_TTL_MS;

    return fresh && typeof pending.menuItemId === "number" && typeof pending.name === "string"
      ? (pending as PendingAdd)
      : null;
  } catch {
    return null;
  }
}
