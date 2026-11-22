"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { CustomerOrder } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/menu";
import {
  fetchOrder,
  formatOrderDate,
  ITEM_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  statusTone,
} from "@/lib/orders";
import { OrderProgress, OrderStatusBadge } from "./order-status";
import { AccountPageHeader } from "@/components/account/account-shell";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { restaurant } from "@/lib/restaurant";
import { HandoffCard } from "./handoff-card";
import { OrderUpdates } from "./order-updates";

/** In-progress orders refresh while the page is visible, so kitchen updates show up. */
const REFRESH_MS = 20_000;

const PAYMENT_METHOD_LABELS = { CARD: "Card", ONLINE: "Online wallet", CASH: "Cash" } as const;
const PAYMENT_STATUS_LABELS = {
  PENDING: "Processing",
  SUCCEEDED: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partly refunded",
} as const;

const STOPPED_TITLES: Partial<Record<CustomerOrder["status"], string>> = {
  REJECTED: "The restaurant couldn't take this order",
  CANCELLED: "This order was cancelled",
  NO_SHOW: "This order wasn't collected",
};

/** Why the order stopped, what happens to the payment, and how to reach the restaurant. */
function StoppedNotice({ order }: { order: CustomerOrder }) {
  const payment = order.payments[0];

  return (
    <div className="rounded-2xl border border-danger/30 bg-danger/5 px-5 py-4 text-sm">
      <p className="font-semibold text-danger">
        {STOPPED_TITLES[order.status] ??
          `This order was ${ORDER_STATUS_LABELS[order.status].toLowerCase()}`}
      </p>
      {order.statusReason ? (
        <p className="mt-1.5 text-fg">
          <span className="text-muted">Reason: </span>
          {order.statusReason}
        </p>
      ) : null}
      <p className="mt-1.5 leading-relaxed text-muted">
        {payment
          ? `You paid ${formatPrice(payment.amountCents)} (${PAYMENT_METHOD_LABELS[payment.method].toLowerCase()}). `
          : ""}
        Refunds are handled by the restaurant: call{" "}
        <a
          href={restaurant.phone.href}
          className="font-semibold text-fg underline underline-offset-4"
        >
          {restaurant.phone.display}
        </a>{" "}
        or email{" "}
        <a
          href={`mailto:${restaurant.email}?subject=${encodeURIComponent(`Order ${order.orderNo}`)}`}
          className="font-semibold text-fg underline underline-offset-4"
        >
          {restaurant.email}
        </a>
        .
      </p>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-t border-line py-3 text-sm first:border-t-0 first:pt-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-fg">{children}</dd>
    </div>
  );
}

export function OrderDetailView({ orderId, placed }: { orderId: number; placed: boolean }) {
  const router = useRouter();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState<{ message: string; notFound?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await fetchOrder(orderId));
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/account/orders/${orderId}`)}`);
        return;
      }
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
        setError({ message: "We couldn't find that order in your account.", notFound: true });
        return;
      }
      setError({
        message: cause instanceof ApiError ? cause.message : "We couldn't load this order.",
      });
    }
  }, [orderId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  // A new notification (for example "ready for pickup") usually means this order changed.
  const { subscribe } = useNotifications();
  useEffect(
    () =>
      subscribe((change) => {
        if (change.kind === "arrived") void load();
      }),
    [subscribe, load],
  );

  const active = order ? statusTone(order.status) === "active" : false;

  useEffect(() => {
    if (!active) return;

    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const handle = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearInterval(handle);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, load]);

  if (error && !order) {
    return (
      <div>
        <AccountPageHeader
          eyebrow="Orders"
          title={error.notFound ? "Order not found" : "Order unavailable"}
          back={{ href: "/account/orders", label: "All orders" }}
        />
        <div role="alert" className="border-t border-line-strong py-16 text-center">
          <p className="text-sm text-muted">{error.message}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {!error.notFound ? (
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink transition hover:opacity-90"
              >
                Try again
              </button>
            ) : null}
            <Link
              href="/account/orders"
              className="rounded-full border border-line-strong px-6 py-3 text-sm font-bold text-fg transition hover:border-brand/50"
            >
              All orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div>
        <AccountPageHeader
          eyebrow="Orders"
          title={placed ? "Placing your order" : "Your order"}
          back={{ href: "/account/orders", label: "All orders" }}
        />
        <div
          className="space-y-4 border-t border-line-strong pt-8"
          role="status"
          aria-label="Loading order"
        >
          <div className="h-28 animate-pulse rounded-2xl bg-surface-2/70" />
          <div className="h-48 animate-pulse rounded-2xl bg-surface-2/70" />
        </div>
      </div>
    );
  }

  const tone = statusTone(order.status);
  const payment = order.payments[0];

  return (
    <div>
      <AccountPageHeader
        eyebrow={placed ? "Order placed" : "Orders"}
        title={placed ? "Your order is in" : order.orderNo}
        back={{ href: "/account/orders", label: "All orders" }}
        description={
          placed ? (
            <>
              Thank you! Order <span className="font-semibold text-fg">{order.orderNo}</span> is
              paid
              {order.type === "TAKEAWAY"
                ? " and the kitchen has it. Show your pickup code at the counter."
                : ` and on its way to the kitchen. We'll bring it to table ${order.table?.label}.`}
            </>
          ) : (
            <>
              {ORDER_TYPE_LABELS[order.type]} · placed {formatOrderDate(order.createdAt)}
            </>
          )
        }
      />

      {placed ? (
        <p role="status" className="sr-only">
          Order {order.orderNo} placed.
        </p>
      ) : null}

      <section className="grid items-center gap-10 border-t border-line-strong py-10 md:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={order.status} />
            {active ? <span className="text-xs text-muted">Updates automatically</span> : null}
          </div>
          <div className="mt-7">
            {tone === "stopped" ? (
              <StoppedNotice order={order} />
            ) : (
              <OrderProgress type={order.type} status={order.status} />
            )}
          </div>
        </div>
        {/* A stopped order has nothing to collect or serve. */}
        {tone === "stopped" ? null : <HandoffCard order={order} />}
      </section>

      <OrderUpdates orderId={order.id} orderVersion={order.updatedAt} />

      <div className="grid gap-12 border-t border-line-strong pt-10 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-14">
        <section aria-labelledby="order-items">
          <h2 id="order-items" className="font-serif text-2xl font-bold tracking-tight text-fg">
            Items
          </h2>
          <ul className="mt-5 border-b border-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-baseline gap-4 border-t border-line py-4">
                <span className="w-7 shrink-0 text-sm tabular-nums text-muted">
                  {item.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-lg font-semibold leading-snug text-fg">
                    {item.name}
                  </p>
                  <p className="text-xs text-muted">
                    {formatPrice(item.unitPriceCents)} each · {ITEM_STATUS_LABELS[item.status]}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                  {formatPrice(item.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="ml-auto mt-5 max-w-xs space-y-2 text-sm">
            <div className="flex justify-between text-muted">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatPrice(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Tax</dt>
              <dd className="tabular-nums">{formatPrice(order.taxCents)}</dd>
            </div>
            {order.tipCents > 0 ? (
              <div className="flex justify-between text-muted">
                <dt>Tip</dt>
                <dd className="tabular-nums">{formatPrice(order.tipCents)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-line-strong pt-3">
              <dt className="font-semibold text-fg">Total</dt>
              <dd className="font-serif text-2xl font-bold tabular-nums text-fg">
                {formatPrice(order.totalCents)}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="order-details">
          <h2 id="order-details" className="font-serif text-2xl font-bold tracking-tight text-fg">
            Details
          </h2>
          <dl className="mt-5">
            <Detail label="Order">{order.orderNo}</Detail>
            <Detail label="Placed">{formatOrderDate(order.createdAt)}</Detail>
            <Detail label="Service">
              {ORDER_TYPE_LABELS[order.type]}
              {order.table ? ` · Table ${order.table.label}` : ""}
            </Detail>
            {order.pickupCode ? <Detail label="Pickup code">{order.pickupCode}</Detail> : null}
            {order.type === "TAKEAWAY" ? (
              <Detail label="Pickup">
                {order.pickupTime ? formatOrderDate(order.pickupTime) : "As soon as it's ready"}
              </Detail>
            ) : null}
            {payment ? (
              <Detail label="Payment">
                {PAYMENT_METHOD_LABELS[payment.method]} · {PAYMENT_STATUS_LABELS[payment.status]}{" "}
                {formatPrice(payment.amountCents)}
                <span className="mt-0.5 block text-xs font-normal text-muted">
                  Test payment — no real money was charged
                </span>
              </Detail>
            ) : null}
            {order.notes ? <Detail label="Notes">{order.notes}</Detail> : null}
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/account/orders"
              className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50"
            >
              All orders
            </Link>
            <Link
              href="/menu"
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-brand-ink transition hover:opacity-90"
            >
              Order more
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
