"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationItem } from "@dinego/shared";
import { NotificationIcon } from "@/components/notifications/notification-icon";
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

const TYPE = "CHECKOUT_INTERRUPTED";

/**
 * Shown at the top of the checkout page when an earlier checkout was interrupted (the API
 * restarted mid-payment): the customer was not charged and can simply check out again. It shows
 * the unread CHECKOUT_INTERRUPTED notifications; "Got it" marks them as read, which also clears
 * them from the header bell. Reading one from the bell hides it here too.
 */
export function InterruptedCheckoutNotice() {
  const { status, markRead, subscribe } = useNotifications();
  const now = useNow();
  const [notices, setNotices] = useState<NotificationItem[]>([]);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchNotifications({
        filter: "unread",
        category: "PAYMENT",
        pageSize: 20,
      });
      setNotices(response.notifications.filter((item) => item.type === TYPE));
    } catch {
      // Informational only: without it the checkout still works, so fail quietly.
    }
  }, []);

  useEffect(() => {
    if (status !== "customer") {
      setNotices([]);
      return;
    }
    void load();
  }, [status, load]);

  // Stay in sync with the bell, the notifications page, and new arrivals.
  useEffect(
    () =>
      subscribe((change) => {
        switch (change.kind) {
          case "updated":
            if (change.item.read) {
              setNotices((current) => current.filter((item) => item.id !== change.item.id));
            } else if (change.item.type === TYPE) {
              void load();
            }
            break;
          case "deleted":
            setNotices((current) => current.filter((item) => item.id !== change.item.id));
            break;
          case "all-read":
            setNotices((current) =>
              current.filter((item) => change.upToId !== null && item.id > change.upToId),
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

  if (notices.length === 0) {
    return <div aria-live="polite" />;
  }

  const [latest] = notices;

  async function dismiss() {
    setDismissing(true);
    setError(null);
    try {
      // The customer read them: every interrupted-checkout notice is marked as read.
      await Promise.all(notices.map((item) => markRead(item)));
    } catch (cause) {
      setError(notificationErrorMessage(cause));
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div aria-live="polite">
      <section
        aria-labelledby="interrupted-checkout-title"
        className="mb-10 flex flex-col gap-4 rounded-2xl border border-line-strong bg-surface/70 p-5 sm:flex-row sm:items-start sm:gap-5"
      >
        <NotificationIcon category="PAYMENT" className="size-10" />
        <div className="min-w-0 flex-1">
          <h2 id="interrupted-checkout-title" className="text-base font-semibold text-fg">
            {latest.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{latest.body}</p>
          <p className="mt-2 text-xs text-muted">
            <time dateTime={latest.createdAt} title={formatNotificationDateTime(latest.createdAt)}>
              {formatNotificationTime(latest.createdAt, now)}
            </time>
            {notices.length > 1
              ? ` · ${notices.length - 1} earlier ${
                  notices.length === 2 ? "checkout was" : "checkouts were"
                } also interrupted`
              : null}
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void dismiss()}
          disabled={dismissing}
          className="shrink-0 self-start rounded-full border border-line-strong px-5 py-2 text-sm font-semibold text-fg transition hover:border-brand/50 disabled:opacity-60"
        >
          {dismissing ? "Saving…" : "Got it"}
        </button>
      </section>
    </div>
  );
}
