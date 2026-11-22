"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NotificationCategory, NotificationItem } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import {
  fetchNotifications,
  formatNotificationDateTime,
  formatNotificationTime,
  formatTimeOfDay,
  groupByDay,
  mergeNotifications,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationFilter,
} from "@/lib/notifications";
import { NotificationIcon } from "./notification-icon";
import {
  notificationErrorMessage,
  useNotifications,
  type NotificationChange,
} from "./notifications-provider";
import { useNow } from "./use-now";

const PAGE_SIZE = 10;

const FILTERS: Array<{ value: NotificationFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

/** A topic chip: one notification category the inbox's audience can receive. */
export type InboxTopic = { value: NotificationCategory; label: string };

type Topic = "all" | NotificationCategory;

/**
 * On phones the topic chips scroll sideways from one screen edge to the other, so the row bleeds
 * out by the page's side padding (customer panel: `px-5`; admin console: `px-3`). Literal class
 * names, so Tailwind generates them.
 */
const TOPIC_ROW_BLEED = {
  3: "-mx-3 w-[calc(100%+1.5rem)] px-3",
  5: "-mx-5 w-[calc(100%+2.5rem)] px-5",
} as const;

const chipClass = (selected: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${
    selected
      ? "border-fg bg-fg text-ink"
      : "border-line text-muted hover:border-line-strong hover:text-fg"
  }`;

const EMPTY: Record<Exclude<NotificationFilter, "all">, { title: string; text: string }> = {
  unread: {
    title: "You're all caught up",
    text: "You have no unread notifications.",
  },
  read: {
    title: "Nothing read yet",
    text: "Notifications you open or mark as read will be listed here.",
  },
};

/**
 * A notifications page body, shared by the customer panel and the admin console: filter by read
 * state and topic, open, mark as read or unread, delete, and mark all as read. Stays in sync with
 * the header bell through the notifications provider. Each panel supplies its own page header
 * (with the "Mark all as read" action), its topics, and its empty-state text.
 */
export function NotificationInbox({
  renderHeader,
  topics,
  emptyText,
  emptyAction,
  gutter = 5,
}: {
  renderHeader: (markAll: { onClick: () => void; disabled: boolean }) => ReactNode;
  /** Topic chips after "Everything", in display order. */
  topics: InboxTopic[];
  /** Shown when the inbox is empty with no filters. */
  emptyText: string;
  /** Optional call to action under that empty state. */
  emptyAction?: { href: string; label: string };
  /** The page's side padding on phones, in Tailwind spacing units (see TOPIC_ROW_BLEED). */
  gutter?: keyof typeof TOPIC_ROW_BLEED;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadCount, markRead, markUnread, remove, markAllRead, subscribe } = useNotifications();
  const topicChips = useMemo<Array<{ value: Topic; label: string }>>(
    () => [{ value: "all", label: "Everything" }, ...topics],
    [topics],
  );
  const now = useNow();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [topic, setTopic] = useState<Topic>("all");
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusId, setFocusId] = useState<number | "heading" | null>(null);

  const filterRef = useRef(filter);
  const topicRef = useRef(topic);
  const itemsRef = useRef<NotificationItem[] | null>(null);
  const requestId = useRef(0);

  /** Updates the list from its latest value (events can arrive between renders). */
  const updateItems = useCallback(
    (next: (current: NotificationItem[] | null) => NotificationItem[] | null) => {
      itemsRef.current = next(itemsRef.current);
      setItems(itemsRef.current);
    },
    [],
  );
  const headingRef = useRef<HTMLHeadingElement>(null);

  /**
   * `first` loads the newest notifications; `more` loads the ones older than the last one shown
   * (a cursor, so deletes and arrivals in between never skip or repeat items).
   */
  const load = useCallback(
    async (nextFilter: NotificationFilter, nextTopic: Topic, mode: "first" | "more") => {
      const id = ++requestId.current;
      const oldest = itemsRef.current?.at(-1)?.id;

      try {
        const response = await fetchNotifications({
          pageSize: PAGE_SIZE,
          filter: nextFilter,
          category: nextTopic === "all" ? undefined : nextTopic,
          beforeId: mode === "more" ? oldest : undefined,
        });

        // A newer request (another filter, a reload) replaced this one.
        if (id !== requestId.current) return;

        updateItems((current) =>
          mode === "first"
            ? response.notifications
            : mergeNotifications(current ?? [], response.notifications),
        );
        setTotal(response.pagination.total);
        setLoadError(null);
      } catch (cause) {
        if (id !== requestId.current) return;

        if (cause instanceof ApiError && cause.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        setLoadError(
          cause instanceof ApiError && cause.status === 0
            ? cause.message
            : "We couldn't load your notifications.",
        );
      }
    },
    [pathname, router, updateItems],
  );

  useEffect(() => {
    filterRef.current = filter;
    topicRef.current = topic;
    updateItems(() => null);
    void load(filter, topic, "first");
  }, [filter, topic, load, updateItems]);

  // Apply changes made here or in the header dropdown, and pick up new arrivals.
  useEffect(
    () =>
      subscribe((change: NotificationChange) => {
        switch (change.kind) {
          case "updated":
            updateItems(
              (current) =>
                current?.map((entry) => (entry.id === change.item.id ? change.item : entry)) ??
                null,
            );
            break;
          case "deleted":
            if (itemsRef.current?.some((entry) => entry.id === change.item.id)) {
              updateItems(
                (current) => current?.filter((entry) => entry.id !== change.item.id) ?? null,
              );
              setTotal((count) => Math.max(0, count - 1));
            }
            break;
          case "all-read":
            updateItems(
              (current) =>
                current?.map((entry) =>
                  entry.read || (change.upToId !== null && entry.id > change.upToId)
                    ? entry
                    : { ...entry, read: true, readAt: change.readAt },
                ) ?? null,
            );
            break;
          case "arrived":
            if (filterRef.current !== "read") {
              void fetchNotifications({
                pageSize: PAGE_SIZE,
                filter: filterRef.current,
                category: topicRef.current === "all" ? undefined : topicRef.current,
              })
                .then((response) => {
                  updateItems((current) =>
                    current === null
                      ? current
                      : mergeNotifications(current, response.notifications),
                  );
                  setTotal(response.pagination.total);
                })
                .catch(() => undefined);
            }
            break;
          case "reset":
            void load(filterRef.current, topicRef.current, "first");
            break;
        }
      }),
    [load, subscribe, updateItems],
  );

  // After a delete, keep keyboard focus in the list.
  useEffect(() => {
    if (focusId === null) return;

    if (focusId === "heading") {
      headingRef.current?.focus();
    } else {
      document.querySelector<HTMLElement>(`[data-notification-action="${focusId}"]`)?.focus();
    }
    setFocusId(null);
  }, [focusId, items]);

  function fail(error: unknown) {
    setActionError(notificationErrorMessage(error));
  }

  function toggleRead(item: NotificationItem) {
    setActionError(null);
    const action = item.read ? markUnread : markRead;
    setAnnouncement(item.read ? "Marked as unread." : "Marked as read.");
    action(item).catch(fail);
  }

  function deleteItem(item: NotificationItem, index: number) {
    setActionError(null);
    const next = items?.[index + 1] ?? items?.[index - 1];
    setFocusId(next ? next.id : "heading");
    setAnnouncement("Notification deleted.");
    remove(item).catch(fail);
  }

  function openItem(item: NotificationItem) {
    setActionError(null);
    markRead(item).catch(fail);
  }

  function markAll() {
    setActionError(null);
    const newest = items?.reduce((max, item) => Math.max(max, item.id), 0);
    setAnnouncement("All notifications marked as read.");
    markAllRead(newest || undefined).catch(fail);
  }

  const groups = items ? groupByDay(items, now) : [];
  const empty =
    filter === "all" ? { title: "No notifications yet", text: emptyText } : EMPTY[filter];
  const positions = new Map(items?.map((item, position) => [item.id, position]));

  return (
    <div>
      {renderHeader({ onClick: markAll, disabled: unreadCount === 0 })}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-4">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-3 sm:w-auto">
          <div role="group" aria-label="Show" className="flex gap-1.5 sm:gap-2">
            {FILTERS.map(({ value, label }) => {
              const selected = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={selected}
                  className={chipClass(selected)}
                >
                  {label}
                  {value === "unread" && unreadCount > 0 ? (
                    <span
                      className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                        selected ? "bg-ink/15" : "bg-surface-2 text-fg"
                      }`}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <span className="hidden h-6 w-px bg-line-strong sm:block" aria-hidden />
          <div
            role="group"
            aria-label="Topic"
            className={`no-scrollbar flex gap-1.5 overflow-x-auto sm:mx-0 sm:w-auto sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 ${TOPIC_ROW_BLEED[gutter]}`}
          >
            {topicChips.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTopic(value)}
                aria-pressed={topic === value}
                className={`shrink-0 ${chipClass(topic === value)}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {items && items.length > 0 ? (
          <p className="text-xs text-muted" aria-live="polite">
            {total} {total === 1 ? "notification" : "notifications"}
          </p>
        ) : null}
      </div>

      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {FILTERS.find((entry) => entry.value === filter)?.label}{" "}
        {topic === "all" ? "" : `${topicChips.find((entry) => entry.value === topic)?.label} `}
        notifications
      </h2>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {actionError ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {actionError}
        </p>
      ) : null}

      {loadError ? (
        <div role="alert" className="border-t border-line-strong py-16 text-center">
          <p className="text-sm text-danger">{loadError}</p>
          <button
            type="button"
            onClick={() => void load(filter, topic, "first")}
            className="mt-4 rounded-full border border-line-strong px-5 py-2 text-sm font-semibold text-fg transition hover:border-brand/50"
          >
            Try again
          </button>
        </div>
      ) : items === null ? (
        <ul className="border-b border-line" role="status" aria-label="Loading notifications">
          {[0, 1, 2].map((row) => (
            <li key={row} className="flex gap-4 border-t border-line py-5">
              <span className="size-10 shrink-0 animate-pulse rounded-full bg-surface-2/70" />
              <span className="flex-1 space-y-2.5 pt-1">
                <span className="block h-4 w-1/2 animate-pulse rounded bg-surface-2/70" />
                <span className="block h-3 w-5/6 animate-pulse rounded bg-surface-2/50" />
              </span>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="border-t border-line-strong py-16 text-center">
          <h2 className="font-serif text-3xl font-bold tracking-tight text-fg">{empty.title}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            {topic === "all"
              ? empty.text
              : `Nothing about ${topicChips.find((entry) => entry.value === topic)?.label.toLowerCase()} here right now.`}
          </p>
          {filter === "all" && topic === "all" ? (
            emptyAction ? (
              <Link
                href={emptyAction.href}
                className="mt-7 inline-flex rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink transition hover:opacity-90"
              >
                {emptyAction.label}
              </Link>
            ) : null
          ) : (
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setTopic("all");
              }}
              className="mt-7 rounded-full border border-line-strong px-6 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50"
            >
              Show all notifications
            </button>
          )}
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="mb-8 last:mb-0">
              <h3 className="pb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {group.label}
              </h3>
              <ul className="border-b border-line">
                {group.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    now={now}
                    onOpen={openItem}
                    onToggleRead={toggleRead}
                    onDelete={(target) => deleteItem(target, positions.get(target.id) ?? 0)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {items.length < total ? (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={async () => {
                  setLoadingMore(true);
                  await load(filter, topic, "more");
                  setLoadingMore(false);
                }}
                disabled={loadingMore}
                className="rounded-full border border-line-strong px-6 py-2.5 text-sm font-semibold text-fg transition hover:border-brand/50 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Show more notifications"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  now,
  onOpen,
  onToggleRead,
  onDelete,
}: {
  item: NotificationItem;
  now: number;
  onOpen: (item: NotificationItem) => void;
  onToggleRead: (item: NotificationItem) => void;
  onDelete: (item: NotificationItem) => void;
}) {
  const href = useNotifications().hrefFor(item);
  const elapsed = now - new Date(item.createdAt).getTime();
  const time =
    elapsed < 24 * 60 * 60 * 1000
      ? formatNotificationTime(item.createdAt, now)
      : formatTimeOfDay(item.createdAt);
  const titleClass = item.read ? "font-medium text-muted" : "font-semibold text-fg";

  return (
    <li className={`border-t border-line transition ${item.read ? "" : "bg-surface/50"}`}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-3">
        <span className="relative mt-0.5">
          <NotificationIcon category={item.category} className="size-10" />
          {item.read ? null : (
            <span
              className="absolute -left-0.5 -top-0.5 size-3 rounded-full bg-brand ring-2 ring-ink"
              aria-hidden
            />
          )}
        </span>

        <div className="min-w-0">
          {href ? (
            <Link
              href={href}
              onClick={() => onOpen(item)}
              data-notification-action={item.id}
              className={`group inline-flex items-baseline gap-1.5 text-base transition hover:text-brand-soft ${titleClass}`}
            >
              {item.read ? null : <span className="sr-only">Unread: </span>}
              {item.title}
              <span
                className="text-sm text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-soft"
                aria-hidden
              >
                →
              </span>
            </Link>
          ) : (
            <p className={`text-base ${titleClass}`}>
              {item.read ? null : <span className="sr-only">Unread: </span>}
              {item.title}
            </p>
          )}
          <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <time dateTime={item.createdAt} title={formatNotificationDateTime(item.createdAt)}>
              {time}
            </time>
            <span aria-hidden>·</span>
            <span>{NOTIFICATION_CATEGORY_LABELS[item.category]}</span>
            {item.priority === "HIGH" ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-semibold text-fg">Important</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="col-start-2 flex flex-wrap gap-1 sm:col-start-auto sm:justify-end">
          <button
            type="button"
            onClick={() => onToggleRead(item)}
            data-notification-action={href ? undefined : item.id}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            {item.read ? <UnreadIcon /> : <CheckIcon />}
            {item.read ? "Mark as unread" : "Mark as read"}
            <span className="sr-only">: {item.title}</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon />
            Delete
            <span className="sr-only">: {item.title}</span>
          </button>
        </div>
      </div>
    </li>
  );
}

function ActionIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function CheckIcon() {
  return (
    <ActionIcon>
      <path d="m5 10.5 3.2 3L15 6.5" />
    </ActionIcon>
  );
}

function UnreadIcon() {
  return (
    <ActionIcon>
      <circle cx="10" cy="10" r="3.5" />
    </ActionIcon>
  );
}

function TrashIcon() {
  return (
    <ActionIcon>
      <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" />
    </ActionIcon>
  );
}
