"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NotificationItem } from "@dinego/shared";
import { fetchNotifications, notificationHref } from "@/lib/notifications";
import { NotificationIcon } from "./notification-icon";
import { useNotifications } from "./notifications-provider";

const TOAST_MS = 12_000;

/**
 * A short-lived card for important order updates that arrive while the customer is browsing:
 * "ready for pickup", "on its way", or "cancelled". Only HIGH priority order notifications are
 * shown (not "placed", "accepted", or "completed"), and not on the page of the order itself,
 * which updates on its own. "View order" counts as opening the notification and marks it read;
 * dismissing does not.
 */
export function OrderUpdateToast() {
  const { status, subscribe, markRead } = useNotifications();
  const pathname = usePathname();
  const [toast, setToast] = useState<{ item: NotificationItem; more: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (status !== "customer") setToast(null);
  }, [status]);

  useEffect(
    () =>
      subscribe((change) => {
        if (change.kind !== "arrived") return;

        // Only what just arrived can toast; the provider never reports the first load.
        const after = change.previousId ?? 0;

        void fetchNotifications({ filter: "unread", category: "ORDER", pageSize: 10 })
          .then((response) => {
            const fresh = response.notifications.filter(
              (item) =>
                item.id > after &&
                item.priority === "HIGH" &&
                notificationHref(item) !== pathnameRef.current,
            );
            if (fresh.length > 0) setToast({ item: fresh[0], more: fresh.length - 1 });
          })
          .catch(() => undefined);
      }),
    [subscribe],
  );

  // Read elsewhere (the bell, the order page): the toast has nothing left to say.
  useEffect(
    () =>
      subscribe((change) => {
        if (
          (change.kind === "updated" && change.item.read) ||
          change.kind === "deleted" ||
          change.kind === "all-read"
        ) {
          setToast((current) =>
            current &&
            (change.kind === "all-read" || ("item" in change && change.item.id === current.item.id))
              ? null
              : current,
          );
        }
      }),
    [subscribe],
  );

  useEffect(() => {
    if (!toast || paused) return;
    const handle = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast, paused]);

  const href = toast ? notificationHref(toast.item) : null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[65] flex justify-center sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-20"
    >
      {toast ? (
        <div
          key={toast.item.id}
          role="status"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="animate-toast-in pointer-events-auto flex w-full max-w-sm gap-3 rounded-2xl border border-line bg-surface p-4 shadow-overlay"
        >
          <NotificationIcon category={toast.item.category} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{toast.item.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
              {toast.item.body}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              {href ? (
                <Link
                  href={href}
                  onClick={() => {
                    markRead(toast.item).catch(() => undefined);
                    setToast(null);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-soft transition hover:bg-brand/10"
                >
                  View order
                </Link>
              ) : null}
              {toast.more > 0 ? (
                <Link
                  href="/account/notifications"
                  onClick={() => setToast(null)}
                  className="text-xs font-semibold text-muted transition hover:text-fg"
                >
                  +{toast.more} more
                </Link>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-3.5"
              aria-hidden
            >
              <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
