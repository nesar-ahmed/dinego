"use client";

import type { PublicMenuItem } from "@dinego/shared";
import { useCart } from "./cart-provider";
import { QuantityStepper } from "./quantity-stepper";

/** "Add" button on a menu card. Becomes a quantity stepper once the item is in the cart. */
export function AddToCartButton({ item }: { item: PublicMenuItem }) {
  const { status, quantityOf, addItem, setQuantity } = useCart();
  const quantity = quantityOf(item.id);

  if (!item.available) {
    return (
      <button
        type="button"
        disabled
        className="h-9 cursor-not-allowed rounded-full border border-line px-4 text-xs font-bold uppercase tracking-[0.1em] text-muted"
      >
        Sold out
      </button>
    );
  }

  if (quantity > 0) {
    return (
      <QuantityStepper
        name={item.name}
        quantity={quantity}
        onChange={(next) => setQuantity(item.id, next)}
        size="sm"
      />
    );
  }

  if (status === "staff") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => addItem(item)}
      aria-label={`Add ${item.name} to cart`}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-xs font-bold text-brand-ink transition hover:opacity-90 active:scale-95 motion-reduce:active:scale-100"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className="size-3.5"
        aria-hidden
      >
        <path d="M5 10h10M10 5v10" strokeLinecap="round" />
      </svg>
      Add
    </button>
  );
}
