"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AccountPageHeader } from "@/components/account/account-shell";
import { useNotifications } from "@/components/notifications/notifications-provider";
import type { CustomerOrderSummary } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/menu";
import { fetchOrders, formatOrderDate, ORDER_TYPE_LABELS } from "@/lib/orders";
import { OrderStatusBadge } from "./order-status";

const PAGE_SIZE = 10;

export function OrderRow({ order }: { order: CustomerOrderSummary }) {
  return (
    <li>
      <Link
        href={`/account/orders/${order.id}`}
        className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 border-t border-line py-5 transition hover:bg-surface/40 md:grid-cols-[9rem_1fr_auto_6.5rem] md:px-3"
      >
        <div>
          <p className="font-serif text-lg font-bold tracking-tight text-fg">{order.orderNo}</p>
          <p className="text-xs text-muted">{formatOrderDate(order.createdAt)}</p>
        </div>
        <p className="order-3 col-span-2 text-sm text-muted md:order-none md:col-span-1">
          <span className="font-semibold text-fg">{ORDER_TYPE_LABELS[order.type]}</span>
          {order.table ? ` · Table ${order.table.label}` : null}
          {order.pickupCode ? ` · Pickup code ${order.pickupCode}` : null}
          <span className="text-muted">
            {" "}
            · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </span>
        </p>
        <div className="order-4 md:order-none">
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="flex items-center justify-end gap-2 text-right font-semibold tabular-nums text-fg">
          {formatPrice(order.totalCents)}
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg"
            aria-hidden
          >
            <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </p>
      </Link>
    </li>
  );
}

/** The customer's order history, newest first, with "Show more" paging. */
export function OrdersListView() {
  const router = useRouter();
  const [orders, setOrders] = useState<CustomerOrderSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(
    async (nextPage: number) => {
      try {
        const response = await fetchOrders(nextPage, PAGE_SIZE);
        setOrders((current) =>
          nextPage === 1 ? response.orders : [...(current ?? []), ...response.orders],
        );
        setTotal(response.pagination.total);
        setPage(nextPage);
        setError(null);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          router.replace(`/login?next=${encodeURIComponent("/account/orders")}`);
          return;
        }
        if (cause instanceof ApiError && cause.status === 403) {
          setForbidden(true);
          return;
        }
        setError(cause instanceof ApiError ? cause.message : "We couldn't load your orders.");
      }
    },
    [router],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  // When a notification arrives an order probably moved: refresh the newest page in place,
  // keeping any orders already loaded with "Show more".
  const { subscribe } = useNotifications();
  useEffect(
    () =>
      subscribe((change) => {
        if (change.kind !== "arrived") return;
        fetchOrders(1, PAGE_SIZE)
          .then((response) => {
            setOrders((current) => {
              if (current === null) return current;
              const fresh = new Map(response.orders.map((order) => [order.id, order]));
              const kept = current.filter((order) => !fresh.has(order.id));
              return [...response.orders, ...kept].sort((a, b) => b.id - a.id);
            });
            setTotal(response.pagination.total);
          })
          .catch(() => undefined);
      }),
    [subscribe],
  );

  async function showMore() {
    setLoadingMore(true);
    await load(page + 1);
    setLoadingMore(false);
  }

  return (
    <div>
      <AccountPageHeader
        title="Orders"
        description="Every order you've placed, newest first. Open one to follow it or see the receipt."
      />

      {forbidden ? (
        <p className="border-t border-line-strong py-16 text-center text-sm text-muted">
          Orders are for customer accounts. Sign in as a customer to see yours.
        </p>
      ) : error ? (
        <div role="alert" className="border-t border-line-strong py-16 text-center">
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={() => void load(1)}
            className="mt-4 rounded-full border border-line-strong px-5 py-2 text-sm font-semibold text-fg transition hover:border-brand/50"
          >
            Try again
          </button>
        </div>
      ) : orders === null ? (
        <ul className="border-b border-line" role="status" aria-label="Loading orders">
          {[0, 1, 2].map((row) => (
            <li key={row} className="border-t border-line py-5">
              <div className="h-10 animate-pulse rounded-lg bg-surface-2/70" />
            </li>
          ))}
        </ul>
      ) : orders.length === 0 ? (
        <div className="border-t border-line-strong py-16 text-center">
          <h2 className="font-serif text-3xl font-bold tracking-tight text-fg">No orders yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            When you order to your table or for pickup, it will appear here.
          </p>
          <Link
            href="/menu"
            className="mt-7 inline-flex rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink transition hover:opacity-90"
          >
            Browse the menu
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {total} {total === 1 ? "order" : "orders"}
          </p>
          <ul className="border-b border-line">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>
          {orders.length < total ? (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => void showMore()}
                disabled={loadingMore}
                className="rounded-full border border-line-strong px-6 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Show more orders"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
