"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NOTIFICATION_POLL_INTERVAL_MS, type NotificationItem } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";
import { fetchMe } from "@/lib/auth-client";
import {
  deleteNotification,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  notificationHref,
} from "@/lib/notifications";

/** The signed-in session: `guest` = signed out, `error` = API unreachable. */
export type NotificationsStatus = "loading" | "guest" | "customer" | "staff" | "error";

/**
 * Whose inbox a provider serves. The public site serves customers (staff see no bell there); the
 * admin console serves staff. The API is the same for both: every account has its own inbox.
 */
export type NotificationsAudience = "customer" | "staff";

/** The session status whose inbox the audience serves. */
const AUDIENCE_STATUS: Record<NotificationsAudience, NotificationsStatus> = {
  customer: "customer",
  staff: "staff",
};

/**
 * A change to the inbox, broadcast to every view (the header dropdown and the notifications page)
 * so they stay in sync whichever one the user acted in.
 */
export type NotificationChange =
  | { kind: "updated"; item: NotificationItem }
  | { kind: "deleted"; item: NotificationItem }
  | { kind: "all-read"; upToId: number | null; readAt: string }
  /**
   * Something new arrived (seen by polling or `refresh`): every notification with an id above
   * `previousId` is new. Never reported for the first load of a session.
   */
  | { kind: "arrived"; latestId: number; previousId: number | null }
  /** A change failed: views should reload from the server. */
  | { kind: "reset" };

type Listener = (change: NotificationChange) => void;

type NotificationsContextValue = {
  status: NotificationsStatus;
  /** True when the session matches the provider's audience: the bell shows and the count polls. */
  active: boolean;
  /** Where a notification leads in this app area, or null (see the provider's `resolveLink`). */
  hrefFor: (item: NotificationItem) => string | null;
  unreadCount: number;
  latestId: number | null;
  /** The newest notifications, for the header dropdown. Null until first loaded. */
  recent: NotificationItem[] | null;
  recentError: string | null;
  loadRecent: () => Promise<void>;
  /**
   * Checks for new notifications now instead of waiting for the next poll, e.g. right after the
   * customer places an order (the API notifies them in the same request).
   */
  refresh: () => Promise<void>;
  /** Each action updates every view at once and rejects (after resyncing) if the server refuses. */
  markRead: (item: NotificationItem) => Promise<void>;
  markUnread: (item: NotificationItem) => Promise<void>;
  remove: (item: NotificationItem) => Promise<void>;
  /** Marks everything up to the newest notification the user can see (`seenUpToId`). */
  markAllRead: (seenUpToId?: number) => Promise<void>;
  subscribe: (listener: Listener) => () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useNotifications must be used inside <NotificationsProvider>");
  }

  return context;
}

/** How many notifications the header dropdown shows. */
export const RECENT_LIMIT = 8;

export function notificationErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 0) return error.message;
  return "We couldn't update your notifications. Please try again.";
}

export function NotificationsProvider({
  audience = "customer",
  resolveLink = notificationHref,
  children,
}: {
  audience?: NotificationsAudience;
  /**
   * Where a notification leads. Defaults to its own `link`. The staff dashboards also open the
   * order or table a notification is about. Pass a stable function (module level or memoized).
   */
  resolveLink?: (item: NotificationItem) => string | null;
  children: ReactNode;
}) {
  const activeStatus = AUDIENCE_STATUS[audience];
  const [status, setStatus] = useState<NotificationsStatus>("loading");
  const active = status === activeStatus;
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestId, setLatestId] = useState<number | null>(null);
  const [recent, setRecent] = useState<NotificationItem[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);

  const listeners = useRef(new Set<Listener>());
  const latestIdRef = useRef<number | null>(null);
  /** False until the first count of this session: anything seen then is not "new". */
  const countLoaded = useRef(false);
  const recentLoaded = useRef(false);
  const statusRef = useRef<NotificationsStatus>("loading");
  // Mutations reach the server one at a time, in click order; the server's answer is applied
  // only when no later mutation is waiting, so fast clicks never apply out of order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);

  const emit = useCallback((change: NotificationChange) => {
    for (const listener of listeners.current) listener(change);
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const setSessionStatus = useCallback((next: NotificationsStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const signedOut = useCallback(() => {
    setSessionStatus("guest");
    setUnreadCount(0);
    setLatestId(null);
    latestIdRef.current = null;
    countLoaded.current = false;
    setRecent(null);
    recentLoaded.current = false;
  }, [setSessionStatus]);

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetchNotifications({ pageSize: RECENT_LIMIT });
      setRecent(response.notifications);
      setUnreadCount(response.unreadCount);
      setRecentError(null);
      recentLoaded.current = true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        signedOut();
        return;
      }
      setRecentError(
        error instanceof ApiError && error.status === 0
          ? error.message
          : "We couldn't load your notifications.",
      );
    }
  }, [signedOut]);

  const refreshCount = useCallback(async () => {
    if (statusRef.current !== activeStatus || pending.current > 0) return;

    try {
      const count = await fetchUnreadCount();
      // A click may have started while the request was in flight; its result wins.
      if (pending.current > 0) return;

      const previous = latestIdRef.current;
      const arrived =
        countLoaded.current &&
        count.latestId !== null &&
        (previous === null || count.latestId > previous);
      latestIdRef.current = count.latestId;
      countLoaded.current = true;
      setLatestId(count.latestId);
      setUnreadCount(count.unreadCount);

      if (arrived && count.latestId !== null) {
        emit({ kind: "arrived", latestId: count.latestId, previousId: previous });
        if (recentLoaded.current) void loadRecent();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) signedOut();
      // Other failures: keep the last known count; the next poll retries.
    }
  }, [activeStatus, emit, loadRecent, signedOut]);

  const loadSession = useCallback(async () => {
    recentLoaded.current = false;
    setRecent(null);

    try {
      const session = await fetchMe();
      const sessionStatus = session.type === "CUSTOMER" ? "customer" : "staff";

      setSessionStatus(sessionStatus);
      // Another audience's session (e.g. staff on the public site): no inbox here.
      if (sessionStatus !== activeStatus) return;

      latestIdRef.current = null;
      countLoaded.current = false;
      await refreshCount();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        signedOut();
      } else {
        setSessionStatus("error");
      }
    }
  }, [activeStatus, refreshCount, setSessionStatus, signedOut]);

  useEffect(() => {
    // Initial load is an external sync with the API, so setting state here is intended.
    void loadSession();
    window.addEventListener(AUTH_CHANGED_EVENT, loadSession);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, loadSession);
  }, [loadSession]);

  // Poll the badge while the page is visible, and catch up as soon as it becomes visible again.
  useEffect(() => {
    if (!active) return;

    const refresh = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    const handle = setInterval(refresh, NOTIFICATION_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearInterval(handle);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, refreshCount]);

  /** Reloads everything after a failed change, so no view shows a change that did not happen. */
  const resync = useCallback(async () => {
    emit({ kind: "reset" });
    await Promise.all([refreshCount(), recentLoaded.current ? loadRecent() : undefined]);
  }, [emit, loadRecent, refreshCount]);

  const run = useCallback(
    <T,>(request: () => Promise<T>, apply: (result: T) => void): Promise<void> => {
      pending.current += 1;

      const task = queue.current.then(async () => {
        try {
          const result = await request();
          if (pending.current === 1) apply(result);
        } finally {
          pending.current -= 1;
        }
      });
      queue.current = task.catch(() => undefined);

      return task.catch(async (error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          signedOut();
        } else {
          await resync();
        }
        throw error;
      });
    },
    [resync, signedOut],
  );

  const replaceInRecent = useCallback((item: NotificationItem) => {
    setRecent((current) => current?.map((entry) => (entry.id === item.id ? item : entry)) ?? null);
  }, []);

  const markRead = useCallback(
    (item: NotificationItem) => {
      if (item.read) return Promise.resolve();

      const optimistic = { ...item, read: true, readAt: new Date().toISOString() };
      replaceInRecent(optimistic);
      setUnreadCount((count) => Math.max(0, count - 1));
      emit({ kind: "updated", item: optimistic });

      return run(
        () => markNotificationRead(item.id),
        (result) => {
          replaceInRecent(result.notification);
          setUnreadCount(result.unreadCount);
          emit({ kind: "updated", item: result.notification });
        },
      );
    },
    [emit, replaceInRecent, run],
  );

  const markUnread = useCallback(
    (item: NotificationItem) => {
      if (!item.read) return Promise.resolve();

      const optimistic = { ...item, read: false, readAt: null };
      replaceInRecent(optimistic);
      setUnreadCount((count) => count + 1);
      emit({ kind: "updated", item: optimistic });

      return run(
        () => markNotificationUnread(item.id),
        (result) => {
          replaceInRecent(result.notification);
          setUnreadCount(result.unreadCount);
          emit({ kind: "updated", item: result.notification });
        },
      );
    },
    [emit, replaceInRecent, run],
  );

  const remove = useCallback(
    (item: NotificationItem) => {
      setRecent((current) => current?.filter((entry) => entry.id !== item.id) ?? null);
      if (!item.read) setUnreadCount((count) => Math.max(0, count - 1));
      emit({ kind: "deleted", item });

      return run(
        async () => {
          try {
            return await deleteNotification(item.id);
          } catch (error) {
            // Already gone (deleted in another tab, or expired): the goal is met.
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
          }
        },
        (result) => {
          if (result) setUnreadCount(result.unreadCount);
        },
      );
    },
    [emit, run],
  );

  const markAllRead = useCallback(
    (seenUpToId?: number) => {
      // Only what the user has seen: a notification arriving right now stays unread.
      const newest = Math.max(seenUpToId ?? 0, latestIdRef.current ?? 0);
      const upToId = newest > 0 ? newest : null;
      const readAt = new Date().toISOString();

      setRecent(
        (current) =>
          current?.map((entry) =>
            entry.read || (upToId !== null && entry.id > upToId)
              ? entry
              : { ...entry, read: true, readAt },
          ) ?? null,
      );
      setUnreadCount(0);
      emit({ kind: "all-read", upToId, readAt });

      return run(
        () => markAllNotificationsRead(upToId),
        (result) => setUnreadCount(result.unreadCount),
      );
    },
    [emit, run],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      status,
      active,
      hrefFor: resolveLink,
      unreadCount,
      latestId,
      recent,
      recentError,
      loadRecent,
      refresh: refreshCount,
      markRead,
      markUnread,
      remove,
      markAllRead,
      subscribe,
    }),
    [
      status,
      active,
      resolveLink,
      unreadCount,
      latestId,
      recent,
      recentError,
      loadRecent,
      refreshCount,
      markRead,
      markUnread,
      remove,
      markAllRead,
      subscribe,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
