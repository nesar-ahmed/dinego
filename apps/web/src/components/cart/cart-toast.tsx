"use client";

import { useCart } from "./cart-provider";

/** Short confirmation or error after a cart action. */
export function CartToast() {
  const { toast, dismissToast, openCart } = useCart();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      {toast ? (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-overlay ${
            toast.tone === "error" ? "border-danger/40" : "border-line"
          }`}
        >
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full ${
              toast.tone === "success"
                ? "bg-ok/15 text-ok"
                : toast.tone === "error"
                  ? "bg-danger/15 text-danger"
                  : "bg-surface-2 text-muted"
            }`}
            aria-hidden
          >
            {toast.tone === "success" ? (
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                className="size-3.5"
              >
                <path d="m5 10.5 3.2 3L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="size-3.5"
              >
                <path d="M10 6v4.5M10 13.5v.1" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <p className="flex-1 text-sm font-medium text-fg">{toast.message}</p>
          {toast.action === "view-cart" ? (
            <button
              type="button"
              onClick={openCart}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-soft transition hover:bg-brand/10"
            >
              View cart
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss"
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-3"
              aria-hidden
            >
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
