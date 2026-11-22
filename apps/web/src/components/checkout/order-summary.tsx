import Link from "next/link";
import type { CheckoutQuote, OrderType, PublicTable } from "@dinego/shared";
import type { CheckoutProblem } from "@/lib/checkout";
import { formatPrice } from "@/lib/menu";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline gap-3 ${strong ? "text-fg" : "text-muted"}`}>
      <dt className={strong ? "font-semibold" : undefined}>{label}</dt>
      <span
        className="flex-1 -translate-y-1 border-b border-dotted border-line-strong"
        aria-hidden
      />
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

function QuoteSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Calculating your total">
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-4 animate-pulse rounded bg-line" />
      ))}
      <div className="mt-6 h-8 w-1/2 animate-pulse rounded bg-line" />
    </div>
  );
}

/**
 * The bill, styled like the printed house card on the home page. Totals come from the quote
 * endpoint, so they are exactly what will be charged.
 */
export function OrderSummary({
  quote,
  quoteLoading,
  quoteProblem,
  orderType,
  table,
  blockedReason,
  submitting,
  problem,
  onSubmit,
  onEditCart,
  onRetryQuote,
}: {
  quote: CheckoutQuote | null;
  quoteLoading: boolean;
  quoteProblem: CheckoutProblem | null;
  orderType: OrderType | null;
  table: PublicTable | null;
  /** Why the order cannot be placed yet, if anything is missing. */
  blockedReason: string | null;
  submitting: boolean;
  problem: CheckoutProblem | null;
  onSubmit: () => void;
  onEditCart: () => void;
  onRetryQuote: () => void;
}) {
  const alert = problem ?? quoteProblem;

  return (
    <div className="relative lg:sticky lg:top-28">
      <div
        className="absolute inset-0 translate-x-1.5 translate-y-2 rotate-[1.5deg] rounded-[1.75rem] border border-line bg-surface-2"
        aria-hidden
      />
      <div className="bg-grain relative rounded-[1.75rem] border border-line-strong bg-paper px-6 py-7 sm:px-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-fg">Your order</h2>
          <button
            type="button"
            onClick={onEditCart}
            disabled={submitting}
            className="text-xs font-semibold text-brand-soft underline-offset-4 transition hover:underline disabled:opacity-50"
          >
            Edit cart
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {orderType === "DINE_IN"
            ? table
              ? `Dine in · Table ${table.label}`
              : "Dine in · choose a table"
            : orderType === "TAKEAWAY"
              ? "Take away · collect at the counter"
              : "Dine in or take away"}
        </p>

        <div className="mx-auto my-5 w-20 border-t-[3px] border-double border-line-strong" />

        {quote ? (
          <div className={quoteLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <ul className="space-y-2.5 text-sm" aria-label="Items">
              {quote.lines.map((line) => (
                <li key={line.menuItemId} className="flex items-baseline gap-3">
                  <span className="text-fg">
                    <span className="tabular-nums text-muted">{line.quantity}×</span> {line.name}
                  </span>
                  <span
                    className="flex-1 -translate-y-1 border-b border-dotted border-line-strong"
                    aria-hidden
                  />
                  <span className="tabular-nums text-fg">{formatPrice(line.lineTotalCents)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              <Row label="Subtotal" value={formatPrice(quote.subtotalCents)} />
              <Row label="Tax" value={formatPrice(quote.taxCents)} />
              {quote.tipCents > 0 ? <Row label="Tip" value={formatPrice(quote.tipCents)} /> : null}
            </dl>

            <div className="mt-4 flex items-baseline justify-between border-t border-line-strong pt-4">
              <span className="text-sm font-semibold text-fg">Total</span>
              <span
                className="font-serif text-3xl font-bold tabular-nums text-fg"
                aria-live="polite"
              >
                {formatPrice(quote.totalCents)}
              </span>
            </div>
          </div>
        ) : quoteProblem ? null : (
          <QuoteSkeleton />
        )}

        {alert ? (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger"
          >
            <p>{alert.message}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
              {alert.reviewCart ? (
                <button type="button" onClick={onEditCart} className="underline underline-offset-4">
                  Review cart
                </button>
              ) : null}
              {alert.viewOrders ? (
                <Link href="/account/orders" className="underline underline-offset-4">
                  View my orders
                </Link>
              ) : null}
              {!problem && quoteProblem && !quoteProblem.reviewCart ? (
                <button
                  type="button"
                  onClick={onRetryQuote}
                  className="underline underline-offset-4"
                >
                  Try again
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={Boolean(blockedReason) || submitting || !quote || quoteLoading}
          aria-describedby="place-order-hint"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-bold text-brand-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-brand-ink/30 border-t-brand-ink motion-reduce:animate-none"
                aria-hidden
              />
              Placing your order…
            </>
          ) : quote ? (
            `Pay ${formatPrice(quote.totalCents)} · Place order`
          ) : (
            "Place order"
          )}
        </button>
        <p id="place-order-hint" className="mt-2.5 text-center text-xs text-muted">
          {blockedReason ?? "Test payment — no real money is charged."}
        </p>
      </div>
    </div>
  );
}
