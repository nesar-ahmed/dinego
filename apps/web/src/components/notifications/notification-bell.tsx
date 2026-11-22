"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { NotificationItem } from "@dinego/shared";
import { formatNotificationDateTime, formatNotificationTime } from "@/lib/notifications";
import { BellIcon, NotificationIcon } from "./notification-icon";
import { notificationErrorMessage, useNotifications } from "./notifications-provider";
import { useNow } from "./use-now";

/**
 * Header bell for the provider's audience (customers on the public site, staff in the admin
 * console): the unread count, and a dropdown with the newest notifications, "Mark all as read",
 * and a link to the full list. Opening a notification marks it as read.
 */
export function NotificationBell({
  viewAllHref = "/account/notifications",
  emptyText = "Order updates and account alerts will show up here.",
}: {
  /** The full notifications page. */
  viewAllHref?: string;
  /** Shown in the dropdown when the inbox is empty. */
  emptyText?: string;
} = {}) {
  const {
    active,
    hrefFor,
    unreadCount,
    recent,
    recentError,
    loadRecent,
    markRead,
    markAllRead,
    subscribe,
  } = useNotifications();
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Phones: the panel spans the screen just below the bell (the header wraps to several rows).
  const [panelTop, setPanelTop] = useState(72);
  const now = useNow();

  // Tell screen reader users when something new arrives (the provider never reports the first load).
  useEffect(
    () =>
      subscribe((change) => {
        if (change.kind === "arrived") setAnnouncement("You have a new notification.");
      }),
    [subscribe],
  );

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    setActionError(null);
    void loadRecent();

    function placePanel() {
      const bottom = buttonRef.current?.getBoundingClientRect().bottom;
      if (bottom !== undefined) setPanelTop(Math.round(bottom + 8));
    }
    placePanel();
    window.addEventListener("resize", placePanel);

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", placePanel);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, loadRecent]);

  if (!active) {
    return null;
  }

  function handleError(error: unknown) {
    setActionError(notificationErrorMessage(error));
  }

  function openNotification(item: NotificationItem) {
    setActionError(null);
    // Close now: the link may stay on this page (e.g. another section of the profile).
    if (hrefFor(item)) setOpen(false);
    markRead(item).catch(handleError);
  }

  function markAll() {
    setActionError(null);
    const newest = recent?.reduce((max, item) => Math.max(max, item.id), 0);
    markAllRead(newest || undefined).catch(handleError);
  }

  const label =
    unreadCount > 0
      ? `Notifications, ${unreadCount} unread`
      : "Notifications, no unread notifications";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Notifications"
        className={`relative grid size-9 place-items-center rounded-xl border bg-surface/60 text-fg transition hover:border-brand/50 hover:text-brand-soft ${
          open ? "border-line-strong" : "border-line"
        }`}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span
            key={unreadCount}
            className="animate-cart-pop absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-black tabular-nums text-brand-ink ring-2 ring-ink"
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          style={{ "--panel-top": `${panelTop}px` } as CSSProperties}
          className="fixed inset-x-3 top-(--panel-top) z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[23.5rem]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">Notifications</h2>
              <p className="text-xs text-muted">
                {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
              </p>
            </div>
            <button
              type="button"
              onClick={markAll}
              disabled={unreadCount === 0}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-soft transition hover:bg-brand/10 disabled:cursor-not-allowed disabled:text-muted disabled:opacity-60 disabled:hover:bg-transparent"
            >
              Mark all as read
            </button>
          </div>

          {actionError ? (
            <p
              role="alert"
              className="border-b border-line bg-danger/10 px-4 py-2 text-xs text-danger"
            >
              {actionError}
            </p>
          ) : null}

          <div className="max-h-[min(26rem,calc(100dvh-var(--panel-top)-9rem))] overflow-y-auto overscroll-contain sm:max-h-[min(26rem,62vh)]">
            {recent === null && recentError ? (
              <div role="alert" className="px-4 py-8 text-center">
                <p className="text-sm text-muted">{recentError}</p>
                <button
                  type="button"
                  onClick={() => void loadRecent()}
                  className="mt-3 rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold text-fg transition hover:border-brand/50"
                >
                  Try again
                </button>
              </div>
            ) : recent === null ? (
              <ul role="status" aria-label="Loading notifications">
                {[0, 1, 2].map((row) => (
                  <li
                    key={row}
                    className="flex gap-3 border-b border-line px-4 py-3.5 last:border-0"
                  >
                    <span className="size-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
                    <span className="flex-1 space-y-2 pt-1">
                      <span className="block h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                      <span className="block h-3 w-full animate-pulse rounded bg-surface-2/70" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : recent.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-muted">
                  <BellIcon />
                </span>
                <p className="mt-3 text-sm font-semibold text-fg">No notifications yet</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{emptyText}</p>
              </div>
            ) : (
              <ul>
                {recent.map((item) => (
                  <DropdownItem
                    key={item.id}
                    item={item}
                    now={now}
                    onOpen={openNotification}
                    onMarkRead={(target) => {
                      setActionError(null);
                      markRead(target).catch(handleError);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          <Link
            href={viewAllHref}
            className="group flex items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-sm font-semibold text-fg transition hover:bg-surface-2/60"
          >
            View all notifications
            <span className="transition group-hover:translate-x-0.5" aria-hidden>
              →
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function DropdownItem({
  item,
  now,
  onOpen,
  onMarkRead,
}: {
  item: NotificationItem;
  now: number;
  onOpen: (item: NotificationItem) => void;
  onMarkRead: (item: NotificationItem) => void;
}) {
  const href = useNotifications().hrefFor(item);
  const content = (
    <>
      <span className="relative">
        <NotificationIcon category={item.category} />
        {item.read ? null : (
          <span
            className="absolute -left-0.5 -top-0.5 size-2.5 rounded-full bg-brand ring-2 ring-surface"
            aria-hidden
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${item.read ? "text-muted" : "font-semibold text-fg"}`}>
          {item.read ? null : <span className="sr-only">Unread: </span>}
          {item.title}
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{item.body}</span>
        <time
          dateTime={item.createdAt}
          title={formatNotificationDateTime(item.createdAt)}
          className="mt-1 block text-[11px] text-muted"
        >
          {formatNotificationTime(item.createdAt, now)}
        </time>
      </span>
    </>
  );
  const rowClass = `flex w-full gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none ${
    item.read ? "" : "pr-12"
  }`;

  return (
    <li className="relative border-b border-line last:border-0">
      {href ? (
        <Link href={href} onClick={() => onOpen(item)} className={rowClass}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={() => onOpen(item)} className={rowClass}>
          {content}
        </button>
      )}
      {item.read ? null : (
        <button
          type="button"
          onClick={() => onMarkRead(item)}
          aria-label={`Mark "${item.title}" as read`}
          title="Mark as read"
          className="absolute right-3 top-3 grid size-7 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-3.5"
            aria-hidden
          >
            <path d="m5 10.5 3.2 3L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </li>
  );
}
