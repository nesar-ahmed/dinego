"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  CheckoutPaymentMethod,
  CheckoutQuote,
  CheckoutRequest,
  OrderType,
  PublicTable,
} from "@dinego/shared";
import { useCart } from "@/components/cart/cart-provider";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { ApiError } from "@/lib/api";
import {
  checkoutProblem,
  fetchQuote,
  fetchTables,
  newIdempotencyKey,
  placeOrder,
  TEST_PAYMENT_OPTIONS,
  tipFor,
  type CheckoutProblem,
  type TipKey,
} from "@/lib/checkout";
import { restaurant } from "@/lib/restaurant";
import { CheckoutStep } from "./checkout-step";
import { DeliveryModePicker } from "./delivery-mode-picker";
import { InterruptedCheckoutNotice } from "./interrupted-checkout-notice";
import { OrderSummary } from "./order-summary";
import { PaymentPicker } from "./payment-picker";
import { TablePicker } from "./table-picker";
import { TipPicker } from "./tip-picker";

const QUOTE_DEBOUNCE_MS = 150;

function PageHeader() {
  return (
    <header className="pb-10 pt-10 sm:pt-14">
      <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand-soft">
        <span className="h-px w-8 bg-brand" aria-hidden />
        Checkout
      </p>
      <h1 className="mt-5 font-serif text-[clamp(2.6rem,6vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.02em] text-fg">
        Complete your order
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        Choose how you&apos;d like to eat, then pay. Your order goes straight to our kitchen.
      </p>
    </header>
  );
}

function Notice({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-t border-line-strong py-16 text-center">
      <h2 className="font-serif text-3xl font-bold tracking-tight text-fg">{title}</h2>
      <div className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{children}</div>
      {action ? <div className="mt-7 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

const primaryAction =
  "inline-flex items-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink transition hover:opacity-90";

export function CheckoutView() {
  const router = useRouter();
  const { status, cart, openCart, reload } = useCart();
  const { refresh: refreshNotifications } = useNotifications();

  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [tables, setTables] = useState<PublicTable[] | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tablesVersion, setTablesVersion] = useState(0);
  const [tableId, setTableId] = useState<number | null>(null);
  const [tipKey, setTipKey] = useState<TipKey>("none");
  const [method, setMethod] = useState<CheckoutPaymentMethod>("CARD");
  const [paymentToken, setPaymentToken] = useState(TEST_PAYMENT_OPTIONS.CARD[0].token);

  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteProblem, setQuoteProblem] = useState<CheckoutProblem | null>(null);
  const [quoteVersion, setQuoteVersion] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<CheckoutProblem | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);

  /** The in-flight checkout attempt. Its key is reused only to retry the exact same request. */
  const attempt = useRef<{ key: string; body: string } | null>(null);

  const tipCents = tipFor(cart.subtotalCents, tipKey);
  const hasItems = cart.items.length > 0;

  // Signed-out visitors sign in first and come straight back.
  useEffect(() => {
    if (status === "guest") {
      router.replace(`/login?next=${encodeURIComponent("/checkout")}`);
    }
  }, [status, router]);

  // The quote follows the cart (edited in the drawer) and the tip. Stale requests are aborted.
  useEffect(() => {
    if (status !== "customer" || !hasItems || placedOrderId !== null) return;

    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const next = await fetchQuote(tipCents, controller.signal);
        setQuote(next);
        setQuoteProblem(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setQuote(null);
        setQuoteProblem(checkoutProblem(error));
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [
    status,
    hasItems,
    cart.updatedAt,
    cart.subtotalCents,
    cart.itemCount,
    tipCents,
    quoteVersion,
    placedOrderId,
  ]);

  // Tables load when dine-in is chosen, and again after "that table was just taken".
  useEffect(() => {
    if (orderType !== "DINE_IN") return;

    const controller = new AbortController();
    setTablesError(null);

    fetchTables(controller.signal)
      .then((fresh) => {
        setTables(fresh);
        // Drop a selection that is no longer orderable.
        setTableId((current) =>
          current !== null && fresh.some((table) => table.id === current && table.orderable)
            ? current
            : null,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTablesError(error instanceof ApiError ? error.message : "We couldn't load the tables.");
      });

    return () => controller.abort();
  }, [orderType, tablesVersion]);

  const selectedTable = useMemo(
    () => tables?.find((table) => table.id === tableId) ?? null,
    [tables, tableId],
  );

  const blockedReason = !orderType
    ? "Choose dine in or take away to continue."
    : orderType === "DINE_IN" && !selectedTable
      ? "Choose your table to continue."
      : null;

  function changeOrderType(next: OrderType) {
    setOrderType(next);
    setProblem(null);
    if (next === "TAKEAWAY") setTableId(null);
  }

  function changeMethod(next: CheckoutPaymentMethod) {
    setMethod(next);
    setPaymentToken(TEST_PAYMENT_OPTIONS[next][0].token);
    setProblem(null);
  }

  async function submit() {
    if (!quote || blockedReason || submitting || !orderType) return;

    const shared = {
      method,
      paymentToken,
      tipCents: quote.tipCents,
      expectedTotalCents: quote.totalCents,
    };
    const request: CheckoutRequest =
      orderType === "DINE_IN" && selectedTable
        ? { orderType: "DINE_IN", tableId: selectedTable.id, ...shared }
        : { orderType: "TAKEAWAY", ...shared };

    const body = JSON.stringify(request);
    if (!attempt.current || attempt.current.body !== body) {
      attempt.current = { key: newIdempotencyKey(), body };
    }

    setSubmitting(true);
    setProblem(null);

    try {
      const order = await placeOrder(request, attempt.current.key);
      attempt.current = null;
      setPlacedOrderId(order.id);
      reload(); // The API removed the ordered items from the cart.
      // The API notified the customer in the same request: show it in the bell now.
      void refreshNotifications();
      router.replace(`/account/orders/${order.id}?placed=1`);
    } catch (error) {
      // After a network failure the request may have gone through: retrying with the same key
      // returns that result instead of paying twice. Any definite answer gets a new key.
      if (!(error instanceof ApiError && error.status === 0)) {
        attempt.current = null;
      }

      const next = checkoutProblem(error);
      setProblem(next);
      setSubmitting(false);

      if (next.refreshQuote) setQuoteVersion((version) => version + 1);
      if (next.refreshTables) {
        setTableId(null);
        setTablesVersion((version) => version + 1);
      }
      if (next.signIn) router.replace(`/login?next=${encodeURIComponent("/checkout")}`);
    }
  }

  if (placedOrderId !== null) {
    return (
      <div>
        <PageHeader />
        <Notice title="Order placed">
          <span role="status">Taking you to your order…</span>
        </Notice>
      </div>
    );
  }

  if (status === "loading" || status === "guest") {
    return (
      <div>
        <PageHeader />
        <div
          className="flex justify-center border-t border-line-strong py-20"
          role="status"
          aria-label="Loading checkout"
        >
          <span className="size-6 animate-spin rounded-full border-2 border-line border-t-brand motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (status === "staff") {
    return (
      <div>
        <PageHeader />
        <Notice title="Checkout is for customers">
          You&apos;re signed in with a staff account. Sign in as a customer to place an order.
        </Notice>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        <PageHeader />
        <Notice
          title="Checkout is taking a moment"
          action={
            <button type="button" onClick={reload} className={primaryAction}>
              Try again
            </button>
          }
        >
          We couldn&apos;t reach the restaurant just now.
        </Notice>
      </div>
    );
  }

  if (!hasItems) {
    return (
      <div>
        <PageHeader />
        <InterruptedCheckoutNotice />
        <Notice
          title="Your cart is empty"
          action={
            <>
              <Link href="/menu" className={primaryAction}>
                Browse the menu
              </Link>
              <Link
                href="/account/orders"
                className="inline-flex items-center rounded-full border border-line-strong px-6 py-3 text-sm font-bold text-fg transition hover:border-brand/50"
              >
                My orders
              </Link>
            </>
          }
        >
          Add a few plates from the menu, then come back here to order.
        </Notice>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PageHeader />
      <InterruptedCheckoutNotice />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-16">
        <div className="space-y-12">
          <CheckoutStep number={1} title="How would you like to eat?">
            <DeliveryModePicker
              value={orderType}
              onChange={changeOrderType}
              disabled={submitting}
            />
          </CheckoutStep>

          {orderType === "TAKEAWAY" ? (
            <CheckoutStep
              number={2}
              title="Pickup"
              description="No table needed — just pay and collect."
            >
              <div className="grid gap-4 rounded-2xl border border-line bg-surface/60 p-5 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <p className="leading-relaxed text-muted">
                  After payment you&apos;ll get a{" "}
                  <span className="font-semibold text-fg">4-digit pickup code</span>. Show it at the
                  counter and we&apos;ll hand over your order.
                </p>
                <address className="not-italic text-muted sm:text-right">
                  <span className="block font-semibold text-fg">{restaurant.address.line1}</span>
                  {restaurant.address.line2}
                </address>
              </div>
            </CheckoutStep>
          ) : (
            <CheckoutStep
              number={2}
              title="Choose your table"
              description={
                orderType === "DINE_IN"
                  ? "Pick the table you're sitting at. The number is on the table."
                  : "Choose dine in above to pick a table. Taking it away? No table needed."
              }
            >
              {orderType === "DINE_IN" ? (
                <TablePicker
                  tables={tables}
                  error={tablesError}
                  value={tableId}
                  onChange={(id) => {
                    setTableId(id);
                    setProblem(null);
                  }}
                  onRetry={() => setTablesVersion((version) => version + 1)}
                  disabled={submitting}
                />
              ) : null}
            </CheckoutStep>
          )}

          <CheckoutStep
            number={3}
            title="Add a tip"
            description="Optional. Every cent goes to the team."
          >
            <TipPicker
              subtotalCents={cart.subtotalCents}
              value={tipKey}
              onChange={setTipKey}
              disabled={submitting}
            />
          </CheckoutStep>

          <CheckoutStep
            number={4}
            title="Payment"
            aside={
              <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-soft">
                Test mode
              </span>
            }
          >
            <PaymentPicker
              method={method}
              token={paymentToken}
              onMethodChange={changeMethod}
              onTokenChange={(token) => {
                setPaymentToken(token);
                setProblem(null);
              }}
              disabled={submitting}
            />
          </CheckoutStep>
        </div>

        <aside aria-label="Order summary">
          <OrderSummary
            quote={quote}
            quoteLoading={quoteLoading}
            quoteProblem={quoteProblem}
            orderType={orderType}
            table={selectedTable}
            blockedReason={blockedReason}
            submitting={submitting}
            problem={problem}
            onSubmit={() => void submit()}
            onEditCart={openCart}
            onRetryQuote={() => setQuoteVersion((version) => version + 1)}
          />
        </aside>
      </div>
    </div>
  );
}
