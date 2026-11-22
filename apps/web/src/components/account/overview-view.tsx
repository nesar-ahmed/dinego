"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { CustomerOrderSummary } from "@dinego/shared";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { HandoffCard } from "@/components/orders/handoff-card";
import { OrderProgress, OrderStatusBadge } from "@/components/orders/order-status";
import { OrderRow } from "@/components/orders/orders-list-view";
import { fetchOrders, formatOrderDate, ORDER_TYPE_LABELS, statusTone } from "@/lib/orders";
import { AccountPageHeader, ArrowIcon, useAccount } from "./account-shell";

const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

type OrdersState = { recent: CustomerOrderSummary[]; total: number } | "loading" | "error";

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-serif text-2xl font-bold tracking-tight text-fg">{title}</h2>
      {action}
    </div>
  );
}

/** The order being prepared right now, with its tracker and pickup code or table. */
function HappeningNow({ order, more }: { order: CustomerOrderSummary; more: number }) {
  return (
    <section aria-labelledby="happening-now" className="border-t border-line-strong py-8">
      <SectionTitle
        title="Happening now"
        action={
          more > 0 ? (
            <Link
              href="/account/orders"
              className="text-sm font-semibold text-muted transition hover:text-fg"
            >
              +{more} more in progress
            </Link>
          ) : undefined
        }
      />
      <span id="happening-now" className="sr-only">
        Order in progress
      </span>
      <div className="mt-6 grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="font-serif text-xl font-bold tracking-tight text-fg">{order.orderNo}</p>
            <span className="text-sm text-muted">
              {ORDER_TYPE_LABELS[order.type]}
              {order.table ? ` · Table ${order.table.label}` : ""} ·{" "}
              {formatOrderDate(order.createdAt)}
            </span>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="mt-6">
            <OrderProgress type={order.type} status={order.status} />
          </div>
          <Link
            href={`/account/orders/${order.id}`}
            className="group mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-fg underline-offset-8 hover:underline"
          >
            Follow this order
            <ArrowIcon />
          </Link>
        </div>
        <HandoffCard order={order} size="md" />
      </div>
    </section>
  );
}

/** When nothing is cooking: an invitation in the site's inverse band style. */
function OrderAgain() {
  return (
    <section className="mt-8 flex flex-wrap items-center justify-between gap-6 rounded-[1.75rem] bg-inverse px-6 py-8 text-inverse-fg sm:px-9">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
          Hungry again?
        </p>
        <p className="mt-2 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Dine in or take away — same menu.
        </p>
      </div>
      <Link
        href="/menu"
        className="group inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink transition hover:opacity-90"
      >
        Browse the menu
        <ArrowIcon />
      </Link>
    </section>
  );
}

function ShortcutRow({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center justify-between gap-6 border-t border-line py-5 transition hover:bg-surface/40 sm:px-3"
      >
        <span className="min-w-0">
          <span className="block font-serif text-lg font-semibold tracking-tight text-fg">
            {title}
          </span>
          <span className="block truncate text-sm text-muted">{body}</span>
        </span>
        <span className="text-muted transition group-hover:text-fg">
          <ArrowIcon />
        </span>
      </Link>
    </li>
  );
}

export function OverviewView() {
  const { customer } = useAccount();
  const { subscribe } = useNotifications();
  const [orders, setOrders] = useState<OrdersState>("loading");
  // Bumped when a notification arrives (an order probably moved), to refetch.
  const [version, setVersion] = useState(0);

  useEffect(
    () =>
      subscribe((change) => {
        if (change.kind === "arrived") setVersion((current) => current + 1);
      }),
    [subscribe],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchOrders(1, 5, controller.signal)
      .then((response) => setOrders({ recent: response.orders, total: response.pagination.total }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setOrders("error");
      });
    return () => controller.abort();
  }, [version]);

  const loaded = typeof orders === "object" ? orders : null;
  const active = loaded?.recent.filter((order) => statusTone(order.status) === "active") ?? [];
  const lastOrder = loaded?.recent[0];

  const stats = [
    { label: "Orders", value: loaded ? String(loaded.total) : "—" },
    { label: "Member since", value: monthYear.format(new Date(customer.createdAt)) },
    {
      label: "Last order",
      value: lastOrder ? shortDate.format(new Date(lastOrder.createdAt)) : "—",
    },
  ];

  return (
    <div>
      <AccountPageHeader
        title={`Hello, ${customer.name.split(" ")[0]}.`}
        description="Your orders, your details, and everything in between."
        actions={
          <Link
            href="/menu"
            className="group inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink transition hover:opacity-90"
          >
            Order from the menu
            <ArrowIcon />
          </Link>
        }
      />

      <dl className="grid grid-cols-3 divide-x divide-line border-y border-line">
        {stats.map((stat) => (
          <div key={stat.label} className="px-3 py-4 first:pl-0 sm:px-5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {stat.label}
            </dt>
            <dd className="mt-1.5 truncate font-serif text-lg font-semibold leading-tight text-fg lining-nums sm:text-2xl">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {active[0] ? (
        <HappeningNow order={active[0]} more={active.length - 1} />
      ) : loaded ? (
        <OrderAgain />
      ) : null}

      <section aria-labelledby="recent-orders" className="mt-10 pt-2">
        <div className="flex items-baseline justify-between gap-4 pb-5">
          <h2 id="recent-orders" className="font-serif text-2xl font-bold tracking-tight text-fg">
            Recent orders
          </h2>
          {loaded && loaded.total > 0 ? (
            <Link
              href="/account/orders"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-fg underline-offset-8 hover:underline"
            >
              All orders
              <ArrowIcon />
            </Link>
          ) : null}
        </div>
        {orders === "loading" ? (
          <ul className="border-b border-line" role="status" aria-label="Loading orders">
            {[0, 1, 2].map((row) => (
              <li key={row} className="border-t border-line py-5">
                <div className="h-10 animate-pulse rounded-lg bg-surface-2/70" />
              </li>
            ))}
          </ul>
        ) : orders === "error" ? (
          <p className="border-t border-line py-6 text-sm text-muted">
            Your orders couldn&apos;t be loaded right now.{" "}
            <Link
              href="/account/orders"
              className="font-semibold text-fg underline underline-offset-4"
            >
              Open orders
            </Link>
          </p>
        ) : orders.recent.length === 0 ? (
          <p className="border-t border-line py-6 text-sm text-muted">
            No orders yet. When you dine in or take away, your orders will appear here.
          </p>
        ) : (
          <ul className="border-b border-line">
            {orders.recent.slice(0, 3).map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="your-details" className="mt-12">
        <h2 id="your-details" className="pb-5 font-serif text-2xl font-bold tracking-tight text-fg">
          Your details
        </h2>
        <ul className="border-b border-line">
          <ShortcutRow
            href="/account/profile#details"
            title="Personal details"
            body={[customer.name, customer.phone].filter(Boolean).join(" · ")}
          />
          <ShortcutRow
            href="/account/profile#email"
            title="Email address"
            body={customer.email ?? ""}
          />
          <ShortcutRow
            href="/account/profile#password"
            title="Password"
            body="Change it, and sign out other devices"
          />
        </ul>
      </section>
    </div>
  );
}
