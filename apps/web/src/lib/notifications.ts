import {
  internalPathSchema,
  markAllNotificationsReadResponseSchema,
  notificationDeleteResponseSchema,
  notificationReadResponseSchema,
  notificationsResponseSchema,
  notificationUnreadCountResponseSchema,
  type MarkAllNotificationsReadResponse,
  type NotificationCategory,
  type NotificationDeleteResponse,
  type NotificationEntityType,
  type NotificationItem,
  type NotificationReadResponse,
  type NotificationsResponse,
  type NotificationUnreadCountResponse,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";

/* ------------------------------- API calls ------------------------------- */

function contractError(label: string): ApiError {
  return new ApiError(`The ${label} response did not match the shared contract.`, 0);
}

function parse<T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  payload: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw contractError(label);
  }

  return parsed.data;
}

export type NotificationFilter = "all" | "unread" | "read";

export async function fetchNotifications(
  options: {
    pageSize?: number;
    filter?: NotificationFilter;
    category?: NotificationCategory;
    /** Only notifications about one record, e.g. one order's updates. */
    entity?: { type: NotificationEntityType; id: number };
    /** Only notifications older than this id (the last one already shown). */
    beforeId?: number;
  } = {},
  signal?: AbortSignal,
): Promise<NotificationsResponse> {
  const params = new URLSearchParams({ pageSize: String(options.pageSize ?? 10) });

  if (options.beforeId !== undefined) params.set("beforeId", String(options.beforeId));
  if (options.filter === "unread") params.set("unread", "true");
  if (options.filter === "read") params.set("unread", "false");
  if (options.category !== undefined) params.set("category", options.category);
  if (options.entity !== undefined) {
    params.set("entityType", options.entity.type);
    params.set("entityId", String(options.entity.id));
  }

  return parse(
    notificationsResponseSchema,
    await apiRequest<unknown>(`/notifications?${params}`, { signal }),
    "notifications",
  );
}

export async function fetchUnreadCount(
  signal?: AbortSignal,
): Promise<NotificationUnreadCountResponse> {
  return parse(
    notificationUnreadCountResponseSchema,
    await apiRequest<unknown>("/notifications/unread-count", { signal }),
    "notification count",
  );
}

export async function markNotificationRead(id: number): Promise<NotificationReadResponse> {
  return parse(
    notificationReadResponseSchema,
    await apiRequest<unknown>(`/notifications/${id}/read`, { method: "PATCH" }),
    "notification",
  );
}

export async function markNotificationUnread(id: number): Promise<NotificationReadResponse> {
  return parse(
    notificationReadResponseSchema,
    await apiRequest<unknown>(`/notifications/${id}/unread`, { method: "PATCH" }),
    "notification",
  );
}

export async function deleteNotification(id: number): Promise<NotificationDeleteResponse> {
  return parse(
    notificationDeleteResponseSchema,
    await apiRequest<unknown>(`/notifications/${id}`, { method: "DELETE" }),
    "notification",
  );
}

/** Marks everything up to `upToId` (the newest notification the user has seen) as read. */
export async function markAllNotificationsRead(
  upToId: number | null,
): Promise<MarkAllNotificationsReadResponse> {
  return parse(
    markAllNotificationsReadResponseSchema,
    await apiRequest<unknown>("/notifications/read-all", {
      method: "POST",
      body: upToId === null ? {} : { upToId },
    }),
    "notification",
  );
}

/* ------------------------------- Presentation ------------------------------ */

/** Where a notification leads, or null. Only paths inside the app are followed. */
export function notificationHref(item: NotificationItem): string | null {
  return item.link !== null && internalPathSchema.safeParse(item.link).success ? item.link : null;
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  ACCOUNT: "Account",
  ORDER: "Order",
  PAYMENT: "Payment",
  FLOOR: "Table",
  SYSTEM: "DineGo",
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto", style: "short" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullDateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const timeOfDay = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

/** "Just now", "5 min. ago", "3 hr. ago", then "Yesterday", a weekday, or the date. */
export function formatNotificationTime(iso: string, now: number): string {
  const elapsed = now - new Date(iso).getTime();

  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  return notificationDayLabel(iso, now);
}

/** Full date and time, for the `title` and `dateTime` of the time element. */
export function formatNotificationDateTime(iso: string): string {
  return fullDateTime.format(new Date(iso));
}

export function formatTimeOfDay(iso: string): string {
  return timeOfDay.format(new Date(iso));
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Day heading for the notifications page: "Today", "Yesterday", "Monday", or "Nov 10". */
export function notificationDayLabel(iso: string, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso).getTime())) / DAY);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return weekday.format(new Date(iso));
  return monthDay.format(new Date(iso));
}

/** Groups newest-first notifications by day, keeping the order. */
export function groupByDay(
  items: NotificationItem[],
  now: number,
): Array<{ label: string; items: NotificationItem[] }> {
  const groups: Array<{ label: string; items: NotificationItem[] }> = [];

  for (const item of items) {
    const label = notificationDayLabel(item.createdAt, now);
    const last = groups.at(-1);

    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }

  return groups;
}

/** Newest first, without duplicates (a page can overlap items that were already loaded). */
export function mergeNotifications(
  current: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));

  for (const item of incoming) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((a, b) => b.id - a.id);
}
