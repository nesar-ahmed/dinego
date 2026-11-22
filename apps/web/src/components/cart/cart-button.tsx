"use client";

import { useCart } from "./cart-provider";

/** Header button that opens the cart drawer. Hidden for staff accounts, which have no cart. */
export function CartButton() {
  const { status, cart, openCart } = useCart();

  if (status === "staff") {
    return null;
  }

  const count = cart.itemCount;

  return (
    <button
      type="button"
      onClick={openCart}
      aria-haspopup="dialog"
      aria-label={count > 0 ? `Open cart, ${count} ${count === 1 ? "item" : "items"}` : "Open cart"}
      data-cart-trigger
      className="relative grid size-9 place-items-center rounded-xl border border-line bg-surface/60 text-fg transition hover:border-brand/50 hover:text-brand-soft"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        className="size-[18px]"
        aria-hidden
      >
        <path
          d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"
          strokeLinejoin="round"
        />
        <path d="M9 10V6.5a3 3 0 0 1 6 0V10" strokeLinecap="round" />
      </svg>
      {count > 0 ? (
        <span
          key={count}
          className="animate-cart-pop absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-black tabular-nums text-brand-ink ring-2 ring-ink"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
