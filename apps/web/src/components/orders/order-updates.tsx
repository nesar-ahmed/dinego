"use client";

import { useCallback, useEffect, useState } from "react";
import { NOTIFICATION_RETENTION_DAYS, type NotificationItem } from "@dinego/shared";
import {
  notificationErrorMessage,
  useNotifications,
} from "@/components/notifications/notifications-provider";
import { useNow } from "@/components/notifications/use-now";
import {
  fetchNotifications,
  formatNotificationDateTime,
  formatNotificationTime,
} from "@/lib/notifications";

/**
 * The order's story from its notifications (placed, accepted, ready, completed, or stopped),
 * oldest first. Unread updates can be marked as read here, which also updates the header bell;
 * reading them anywhere else updates this list.
 */
export function OrderUpdates({
  orderId,
  orderVersion,
}: {
  orderId: number;
  /** The order's `updatedAt`: when the order page sees the order change, the updates reload. */
  orderVersion: string;
}) {
  const { status, markRead, subscribe } = useNotifications();
  const now = useNow();
  const [updates, setUpdates] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchNotifications({
        entity: { type: "ORDER", id: orderId },
        pageSize: 50,
      });
      setUpdates([...response.notifications].reverse());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [orderId]);

  useEffect(() => {
    if (status === "customer") void load();
  }, [status, load, orderVersion]);

  useEffect(
    () =>
      subscribe((change) => {
        switch (change.kind) {
          case "updated":
            setUpdates(
              (current) =>
                current?.map((entry) => (entry.id === change.item.id ? change.item : entry)) ??
                null,
            );
            break;
          case "deleted":
            setUpdates(
              (current) => current?.filter((entry) => entry.id !== change.item.id) ?? null,
            );
            break;
          case "all-read":
            setUpdates(
              (current) =>
                current?.map((entry) =>
                  entry.read || (change.upToId !== null && entry.id > change.upToId)
                    ? entry
                    : { ...entry, read: true, readAt: change.readAt },
                ) ?? null,
            );
            break;
          case "arrived":
          case "reset":
            void load();
            break;
        }
      }),
    [subscribe, load],
  );

  function read(item: NotificationItem) {
    setActionError(null);
    markRead(item).catch((error: unknown) => setActionError(notificationErrorMessage(error)));
  }

  return (
    <section aria-labelledby="order-updates" className="border-t border-line-strong py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="order-updates" className="font-serif text-2xl font-bold tracking-tight text-fg">
          Updates
        </h2>
        <p className="text-xs text-muted">Kept for {NOTIFICATION_RETENTION_DAYS} days</p>
      </div>

      {actionError ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      {updates === null ? (
        failed ? (
          <p className="mt-5 text-sm text-muted">
            Updates couldn&apos;t be loaded right now.{" "}
            <button
              type="button"
              onClick={() => void load()}
              className="font-semibold text-fg underline underline-offset-4"
            >
              Try again
            </button>
          </p>
        ) : (
          <div className="mt-5 space-y-3" role="status" aria-label="Loading updates">
            <div className="h-12 animate-pulse rounded-xl bg-surface-2/70" />
            <div className="h-12 animate-pulse rounded-xl bg-surface-2/50" />
          </div>
        )
      ) : updates.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Updates about this order will appear here as the restaurant works on it.
        </p>
      ) : (
        <ol className="mt-6 max-w-2xl">
          {updates.map((item, index) => (
            <li key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
              {index < updates.length - 1 ? (
                <span
                  className="absolute left-[5px] top-4 h-full w-px bg-line-strong"
                  aria-hidden
                />
              ) : null}
              <span
                className={`relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${
                  item.read ? "border-line-strong bg-ink" : "border-brand bg-brand"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p
                    className={`text-sm ${item.read ? "font-medium text-fg" : "font-semibold text-fg"}`}
                  >
                    {item.read ? null : <span className="sr-only">Unread: </span>}
                    {item.title}
                  </p>
                  <time
                    dateTime={item.createdAt}
                    title={formatNotificationDateTime(item.createdAt)}
                    className="text-xs text-muted"
                  >
                    {formatNotificationTime(item.createdAt, now)}
                  </time>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
                {item.read ? null : (
                  <button
                    type="button"
                    onClick={() => read(item)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-fg"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="size-3.5"
                      aria-hidden
                    >
                      <path d="m5 10.5 3.2 3L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Mark as read
                    <span className="sr-only">: {item.title}</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
