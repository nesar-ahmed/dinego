"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import type { CartLine } from "@dinego/shared";
import { formatPrice } from "@/lib/menu";
import { useCart } from "./cart-provider";
import { QuantityStepper } from "./quantity-stepper";

function formatAllergen(allergen: string): string {
  return allergen.charAt(0).toUpperCase() + allergen.slice(1);
}

function CartLineItem({ line, onEmptied }: { line: CartLine; onEmptied: () => void }) {
  const { setQuantity, removeItem } = useCart();
  const rowRef = useRef<HTMLLIElement>(null);
  const { item } = line;

  /** Keeps keyboard focus in the list when the focused row disappears. */
  const moveFocusBeforeRemoval = () => {
    const row = rowRef.current;
    const neighbour = (row?.nextElementSibling ??
      row?.previousElementSibling) as HTMLElement | null;
    const target = neighbour?.querySelector<HTMLElement>("button:not([disabled])");

    if (target) {
      target.focus();
    } else {
      onEmptied();
    }
  };

  const remove = () => {
    moveFocusBeforeRemoval();
    removeItem(item.id);
  };

  return (
    <li ref={rowRef} className={`flex gap-4 py-5 ${line.purchasable ? "" : "opacity-80"}`}>
      <div
        className="grid size-14 shrink-0 place-items-center rounded-2xl border border-line bg-gradient-to-br from-brand/15 to-surface-2 font-serif text-2xl font-bold text-brand-soft"
        aria-hidden
      >
        {item.name.charAt(0)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-base font-semibold leading-snug text-fg">{item.name}</h3>
          <p
            className={`shrink-0 text-sm font-semibold tabular-nums ${line.purchasable ? "text-fg" : "text-muted line-through"}`}
          >
            {formatPrice(line.lineTotalCents)}
          </p>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {formatPrice(item.priceCents)} each · {item.category.name}
        </p>
        {item.allergens.length > 0 ? (
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            <span className="font-semibold text-amber-600 dark:text-amber-400">Allergens:</span>{" "}
            {item.allergens.map(formatAllergen).join(", ")}
          </p>
        ) : null}

        {!line.purchasable ? (
          <p className="mt-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs font-medium text-danger">
            No longer available — not included in your total.
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3">
          <QuantityStepper
            name={item.name}
            quantity={line.quantity}
            canIncrease={line.purchasable}
            onChange={(quantity) => (quantity <= 0 ? remove() : setQuantity(item.id, quantity))}
            size="sm"
          />
          <button
            type="button"
            onClick={remove}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-muted underline-offset-4 transition hover:text-danger hover:underline"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function StateMessage({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <div className="grid size-16 place-items-center rounded-full border border-line bg-surface-2 text-brand-soft">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-7"
          aria-hidden
        >
          <path
            d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"
            strokeLinejoin="round"
          />
          <path d="M9 10V6.5a3 3 0 0 1 6 0V10" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="mt-5 font-serif text-2xl font-bold tracking-tight text-fg">{title}</h3>
      <div className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{children}</div>
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

const primaryButton =
  "rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:opacity-90";
const secondaryButton =
  "rounded-xl border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50";

/** Slide-over cart panel: right side on larger screens, full width on phones. */
export function CartDrawer() {
  const { status, cart, isOpen, closeCart, reload } = useCart();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Close when navigating to another page.
  useEffect(() => {
    closeCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to route changes.
  }, [pathname]);

  // Scroll lock, focus handling, Escape to close, and a focus trap while open.
  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCart();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // The opener may be gone (the toast's "View cart" button is removed when the drawer
      // opens, which leaves focus on <body>), so fall back to the header cart button.
      const previous = restoreFocusRef.current;
      const restore =
        previous && previous !== document.body && document.contains(previous)
          ? previous
          : document.querySelector<HTMLElement>("[data-cart-trigger]");
      restore?.focus();
    };
  }, [isOpen, closeCart]);

  const loginHref =
    typeof window === "undefined"
      ? "/login"
      : `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;

  // Sold-out lines would be refused at checkout, so the customer removes them first.
  const canCheckout = cart.itemCount > 0 && !cart.hasUnavailableItems;

  let body: ReactNode;

  if (status === "loading") {
    body = (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label="Loading cart"
      >
        <span className="size-6 animate-spin rounded-full border-2 border-line border-t-brand motion-reduce:animate-none" />
      </div>
    );
  } else if (status === "guest") {
    body = (
      <StateMessage
        title="Sign in to start an order"
        action={
          <>
            <Link href={loginHref} className={primaryButton}>
              Login
            </Link>
            <Link href="/register" className={secondaryButton}>
              Create account
            </Link>
          </>
        }
      >
        Your cart is saved to your account, so it follows you to any device.
      </StateMessage>
    );
  } else if (status === "staff") {
    body = (
      <StateMessage title="Carts are for customers">
        You are signed in with a staff account. Sign in as a customer to place an order.
      </StateMessage>
    );
  } else if (status === "error") {
    body = (
      <StateMessage
        title="Your cart is taking a moment"
        action={
          <button type="button" onClick={reload} className={primaryButton}>
            Try again
          </button>
        }
      >
        We couldn&apos;t load your cart just now.
      </StateMessage>
    );
  } else if (cart.items.length === 0) {
    body = (
      <StateMessage
        title="Your cart is empty"
        action={
          pathname === "/menu" ? (
            <button type="button" onClick={closeCart} className={primaryButton}>
              Browse the menu
            </button>
          ) : (
            <Link href="/menu" className={primaryButton}>
              Browse the menu
            </Link>
          )
        }
      >
        Add a few plates from the menu and they will appear here.
      </StateMessage>
    );
  } else {
    body = (
      <>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
          {cart.hasUnavailableItems ? (
            <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-xs leading-relaxed text-danger">
              Some items are no longer available. They are not included in your total — you can
              remove them or lower their quantity.
            </p>
          ) : null}
          <ul className="divide-y divide-line">
            {cart.items.map((line) => (
              <CartLineItem
                key={line.item.id}
                line={line}
                onEmptied={() => closeRef.current?.focus()}
              />
            ))}
          </ul>
        </div>

        <div className="border-t border-line bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-muted">
              Subtotal · {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
            </p>
            <p className="font-serif text-2xl font-bold tabular-nums text-fg" aria-live="polite">
              {formatPrice(cart.subtotalCents)}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted">Taxes are calculated at checkout.</p>
          {canCheckout ? (
            <Link
              href="/checkout"
              onClick={() => {
                // Already on the checkout page: the route does not change, so close explicitly.
                if (pathname === "/checkout") closeCart();
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-brand-ink transition hover:opacity-90"
            >
              Checkout
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="size-4"
                aria-hidden
              >
                <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : (
            <button
              type="button"
              disabled
              aria-describedby="checkout-blocked"
              className="mt-4 w-full cursor-not-allowed rounded-xl bg-brand py-3 text-sm font-bold text-brand-ink opacity-50"
            >
              Checkout
            </button>
          )}
          <p
            id={canCheckout ? undefined : "checkout-blocked"}
            className="mt-2 text-center text-xs text-muted"
          >
            {canCheckout
              ? "Dine in or take away — choose at checkout."
              : "Remove the unavailable items to check out."}
          </p>
        </div>
      </>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[60] ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={closeCart}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        inert={!isOpen}
        className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface transition-transform duration-300 ease-out motion-reduce:transition-none sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id="cart-title" className="font-serif text-2xl font-bold tracking-tight text-fg">
              Your order
            </h2>
            {status === "customer" && cart.items.length > 0 ? (
              <p className="text-xs text-muted">
                {cart.items.length} {cart.items.length === 1 ? "dish" : "dishes"} · takeaway or dine
                in
              </p>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
            className="grid size-9 place-items-center rounded-xl border border-line text-muted transition hover:border-line-strong hover:text-fg"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-4"
              aria-hidden
            >
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
