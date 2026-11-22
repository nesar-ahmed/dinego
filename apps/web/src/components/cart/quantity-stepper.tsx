"use client";

import { CART_MAX_ITEM_QUANTITY } from "@dinego/shared";

type QuantityStepperProps = {
  name: string;
  quantity: number;
  onChange: (quantity: number) => void;
  /** Blocks increasing, for example when the item is no longer available. */
  canIncrease?: boolean;
  size?: "sm" | "md";
};

/** − n + control. At 1, the minus button becomes "remove". */
export function QuantityStepper({
  name,
  quantity,
  onChange,
  canIncrease = true,
  size = "md",
}: QuantityStepperProps) {
  const atMax = quantity >= CART_MAX_ITEM_QUANTITY;
  const button = size === "sm" ? "size-8" : "size-9";

  return (
    <div
      className="inline-flex items-center rounded-full border border-brand/40 bg-surface"
      role="group"
      aria-label={`Quantity of ${name}`}
    >
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={quantity <= 1 ? `Remove ${name} from cart` : `Decrease ${name}`}
        className={`${button} grid place-items-center rounded-full text-fg transition hover:bg-brand/10 hover:text-brand-soft`}
      >
        {quantity <= 1 ? (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className="size-4"
            aria-hidden
          >
            <path
              d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-4"
            aria-hidden
          >
            <path d="M5 10h10" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <span
        className="min-w-7 text-center text-sm font-bold tabular-nums text-fg"
        aria-live="polite"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={atMax || !canIncrease}
        aria-label={`Increase ${name}`}
        title={atMax ? `Up to ${CART_MAX_ITEM_QUANTITY} per item` : undefined}
        className={`${button} grid place-items-center rounded-full text-fg transition hover:bg-brand/10 hover:text-brand-soft disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-fg`}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-4"
          aria-hidden
        >
          <path d="M5 10h10M10 5v10" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
